using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;
using MediaHouse.DTOs.Upload;
using MediaHouse.Config;

namespace MediaHouse.Services;

public class UploadService(
    MediaHouseDbContext context,
    IOptions<UploadSettings> uploadSettings,
    IHostEnvironment environment,
    ILogger<UploadService> logger) : IUploadService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _settings = uploadSettings.Value;
    private readonly IHostEnvironment _environment = environment;
    private readonly ILogger<UploadService> _logger = logger;

    private string GetAbsolutePath(string path)
    {
        if (Path.IsPathRooted(path))
        {
            return path;
        }
        return Path.Combine(_environment.ContentRootPath, path);
    }

    public async Task<UploadTaskDto> CreateUploadTaskAsync(CreateUploadRequest request)
    {
        // 验证文件大小
        if (request.file_size > _settings.MaxFileSize)
        {
            throw new InvalidOperationException($"File size exceeds maximum allowed size of {_settings.MaxFileSize} bytes");
        }

        // 验证文件扩展名
        var extension = Path.GetExtension(request.file_name).ToLower();
        if (!_settings.AllowedExtensions.Contains(extension))
        {
            throw new InvalidOperationException($"File extension {extension} is not allowed");
        }

        // 根据 MD5 查找已有任务
        var existingTask = await _context.UploadTasks
            .Where(t => t.FileMd5 == request.file_md5 && t.Status != 2)
            .FirstOrDefaultAsync();

        if (existingTask == null)
        {
            // 创建新任务
            var uploadId = Guid.NewGuid().ToString();
            var totalChunks = (int)Math.Ceiling((double)request.file_size / request.chunk_size);

            // 创建上传目录
            var uploadDir = Path.Combine(_settings.UploadPath, uploadId);
            Directory.CreateDirectory(uploadDir);
            Directory.CreateDirectory(Path.Combine(uploadDir, "chunks"));

            var uploadTask = new UploadTask
            {
                Id = uploadId,
                FileName = request.file_name,
                FileSize = request.file_size,
                FileMd5 = request.file_md5,
                ChunkSize = request.chunk_size,
                TotalChunks = totalChunks,
                UploadedChunksNum = 0,
                UploadedSize = 0,
                Status = 0, // 待上传
                UploadDir = uploadDir,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.UploadTasks.Add(uploadTask);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Created upload task {UploadId} for file {FileName}", uploadId, request.file_name);

            return new UploadTaskDto
            {
                UploadId = uploadId,
                FileName = request.file_name,
                FileSize = request.file_size,
                FileMd5 = request.file_md5,
                ChunkSize = request.chunk_size,
                TotalChunks = totalChunks,
                UploadedChunksNum = 0,
                UploadedSize = 0,
                MaxUploadedChunkIndex = -1,
                MissingChunksInUploadedRange = [],
                Progress = 0,
                Status = "pending",
                CreatedAt = DateTime.UtcNow.ToString("o"),
                IsNew = true
            };
        }
        else
        {
            // 返回已有任务信息
            _logger.LogInformation("Found existing upload task {UploadId} for file {FileName}", existingTask.Id, request.file_name);
            var uploadedChunkInfo = CalculateUploadedChunk(existingTask.Id, existingTask.TotalChunks, existingTask.ChunkSize, existingTask.FileSize);
            existingTask.UploadedChunksNum = uploadedChunkInfo.UploadedChunks;
            existingTask.UploadedSize = uploadedChunkInfo.UploadedSize;

            return new UploadTaskDto
            {
                UploadId = existingTask.Id,
                FileName = existingTask.FileName,
                FileSize = existingTask.FileSize,
                FileMd5 = existingTask.FileMd5 ?? string.Empty!,
                ChunkSize = existingTask.ChunkSize,
                TotalChunks = existingTask.TotalChunks,
                UploadedChunksNum = uploadedChunkInfo.UploadedChunks,
                UploadedSize = uploadedChunkInfo.UploadedSize,
                MaxUploadedChunkIndex = uploadedChunkInfo.MaxUploadedIndex,
                MissingChunksInUploadedRange = uploadedChunkInfo.MissingChunksInUploadedRange,
                Progress = existingTask.FileSize > 0 ? (double)uploadedChunkInfo.UploadedSize / existingTask.FileSize : 0,
                Status = GetStatusString(existingTask.Status),
                CreatedAt = existingTask.CreatedAt.ToString("o"),
                UpdatedAt = existingTask.UpdatedAt.ToString("o"),
                IsNew = false
            };
        }
    }

    public async Task<UploadTaskDto> GetUploadProgressAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId) ?? throw new InvalidOperationException($"Upload task not found: {uploadId}");

        return MapToDto(task);
    }

    public async Task<List<UploadTaskDto>> GetAllUploadTasksAsync()
    {
        var tasks = await _context.UploadTasks.ToListAsync();
        return [.. tasks.Select(MapToDto)];
    }

    public async Task<bool> DeleteUploadTaskAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null) return false;

        _context.UploadTasks.Remove(task);
        await _context.SaveChangesAsync();

        // 删除上传目录
        var uploadDir = Path.Combine(_settings.UploadPath, uploadId);
        if (Directory.Exists(uploadDir))
        {
            Directory.Delete(uploadDir, true);
        }

        _logger.LogInformation("Deleted upload task {UploadId}", uploadId);
        return true;
    }

    public async Task<MergeResponse> MergeAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null)
        {
            return new MergeResponse
            {
                Success = false,
                Error = "Upload task not found"
            };
        }

        // 确定上传目录 - 优先使用保存的路径
        var uploadDir = !string.IsNullOrEmpty(task.UploadDir)
            ? task.UploadDir
            : Path.Combine(_settings.UploadPath, uploadId);

        // 检查所有分片是否完整
        var chunkDir = Path.Combine(uploadDir, "chunks");
        var missingChunks = new List<int>();

        for (int i = 0; i < task.TotalChunks; i++)
        {
            var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
            if (!File.Exists(chunkFile))
            {
                missingChunks.Add(i);
            }
            else
            {
                // 验证分片大小
                var chunkFileInfo = new FileInfo(chunkFile);
                bool isLastChunk = i == task.TotalChunks - 1;
                bool sizeValid;
                if (isLastChunk)
                {
                    long expectedLastChunkSize = task.FileSize - (long)(task.TotalChunks - 1) * task.ChunkSize;
                    sizeValid = chunkFileInfo.Length == expectedLastChunkSize;
                }
                else
                {
                    sizeValid = chunkFileInfo.Length == task.ChunkSize;
                }

                if (!sizeValid)
                {
                    missingChunks.Add(i);
                }
            }
        }

        if (missingChunks.Count > 0)
        {
            return new MergeResponse
            {
                Success = false,
                Error = "missing_chunks",
                MissingChunks = [.. missingChunks],
                UploadedChunksNum = task.TotalChunks - missingChunks.Count
            };
        }

        // 合并分片
        var mergedFile = Path.Combine(uploadDir, task.FileName);

        var outputStream = new FileStream(mergedFile, FileMode.Create, FileAccess.Write);

        for (int i = 0; i < task.TotalChunks; i++)
        {
            var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
            using var inputStream = new FileStream(chunkFile, FileMode.Open, FileAccess.Read);
            await inputStream.CopyToAsync(outputStream);
        }
        outputStream.Dispose();

        // 验证文件大小
        var fileInfo = new FileInfo(mergedFile);
        if (fileInfo.Length != task.FileSize)
        {
            return new MergeResponse
            {
                Success = false,
                Error = "File size mismatch after merge - expected: " + task.FileSize + ", actual: " + fileInfo.Length
            };
        }

        // 创建 staging_media 记录
        var mediaId = Guid.NewGuid().ToString();
        string stagingDir;
        string stagingFile;

        if (!string.IsNullOrEmpty(task.FolderId))
        {
            // 文件夹上传：staging/folders/{folder_id}/{relative_path}/
            var folderStagingDir = Path.Combine(_settings.StagingPath, "folders", task.FolderId);
            var relativeDir = !string.IsNullOrEmpty(task.RelativePath)
                ? Path.GetDirectoryName(task.RelativePath) ?? ""
                : "";

            // 保持原始目录结构
            stagingDir = Path.Combine(folderStagingDir, relativeDir);
            Directory.CreateDirectory(stagingDir);

            stagingFile = Path.Combine(stagingDir, task.FileName);
        }
        else
        {
            // 单文件上传：staging/{media_id}/
            stagingDir = Path.Combine(_settings.StagingPath, mediaId);
            Directory.CreateDirectory(stagingDir);

            stagingFile = Path.Combine(stagingDir, task.FileName);
        }

        var stagingMedia = new StagingMedia
        {
            Id = mediaId,
            UploadTaskId = uploadId,
            FolderId = task.FolderId,
            RelativePath = task.RelativePath,
            Type = "movie",
            Title = Path.GetFileNameWithoutExtension(task.FileName),
            VideoPath = GetAbsolutePath(stagingFile),
            VideoSize = task.FileSize,
            Status = 0, // 待编辑
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.StagingMedias.Add(stagingMedia);

        // 更新任务状态
        task.Status = 2; // 已完成
        task.UpdatedAt = DateTime.UtcNow;
        task.CompletedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Merged upload task {UploadId} and created staging media {MediaId}", uploadId, mediaId);

        // 移动合并后的文件到 staging 目录
        File.Move(mergedFile, stagingFile);

        // 删除上传目录（包含 chunks 子目录）
        if (Directory.Exists(uploadDir))
        {
            Directory.Delete(uploadDir, true);
        }

        return new MergeResponse
        {
            Success = true,
            Data = new MergeData
            {
                MediaId = mediaId,
                Status = "completed"
            }
        };
    }

    private UploadedChunkInfo CalculateUploadedChunk(string uploadId, int totalChunks, int chunkSize, long fileSize, string? taskUploadDir = null)
    {
        var uploadedInfo = new UploadedChunkInfo
        {
            MaxUploadedIndex = -1,
            UploadedChunks = 0,
            UploadedSize = 0
        };

        // 使用保存的路径，如果未保存则使用默认路径
        string chunkDir = Path.Combine(!string.IsNullOrEmpty(taskUploadDir)
            ? taskUploadDir
            : Path.Combine(_settings.UploadPath, uploadId), "chunks");

        var MissingChunksInUploadedRange = new List<int>();
        
        // 1. 新增：用于累加文件大小
        long totalUploadedSize = 0;

        if (Directory.Exists(chunkDir))
        {
            var dirInfo = new DirectoryInfo(chunkDir);
            
            // 2. 使用 HashSet 提高查找效率 (O(1))，替代 List + OrderByDescending
            // 同时在这里计算总大小
            var uploadedChunkSet = new HashSet<int>();

            foreach (var file in dirInfo.EnumerateFiles("*.chunk")) // 只遍历 .chunk 文件
            {
                // 提取索引 (去掉 .chunk 后缀)
                var fileNameWithoutExt = Path.GetFileNameWithoutExtension(file.Name);

                if (!string.IsNullOrEmpty(fileNameWithoutExt) && int.TryParse(fileNameWithoutExt, out int index))
                {
                    // 验证分片大小
                    bool isLastChunk = index == totalChunks - 1;
                    bool sizeValid;
                    if (isLastChunk)
                    {
                        // 最后一个分片：精确计算期望大小
                        long expectedLastChunkSize = fileSize - (long)(totalChunks - 1) * chunkSize;
                        sizeValid = file.Length == expectedLastChunkSize;
                    }
                    else
                    {
                        // 其他分片：大小必须等于 chunkSize
                        sizeValid = file.Length == chunkSize;
                    }

                    if (sizeValid)
                    {
                        uploadedChunkSet.Add(index);

                        // 3. 累加文件大小
                        totalUploadedSize += file.Length;
                    }
                    // 如果大小不正确，不加入已上传集合，会被标记为缺失
                }
            }

            // 4. 计算起始索引 (即：下一个该传的索引 = 目前已传的最大索引 + 1)
            // 如果没有分片，默认为 0
            uploadedInfo.MaxUploadedIndex = uploadedChunkSet.Count > 0 ? uploadedChunkSet.Max() : -1;
            uploadedInfo.UploadedChunks = uploadedChunkSet.Count;
            uploadedInfo.UploadedSize = totalUploadedSize;

            // 5. 计算缺失的分片
            // 使用 HashSet 的 Contains 方法，速度极快
            for (int i = 0; i < totalChunks && i < uploadedInfo.MaxUploadedIndex; i++)
            {
                if (!uploadedChunkSet.Contains(i))
                {
                    MissingChunksInUploadedRange.Add(i);
                }
            }
            
        }
        
        // 6. 赋值
        uploadedInfo.MissingChunksInUploadedRange = [.. MissingChunksInUploadedRange];
        return uploadedInfo;
    }

    private UploadTaskDto MapToDto(UploadTask task)
    {
        var uploadedChunkInfo = CalculateUploadedChunk(task.Id, task.TotalChunks, task.ChunkSize, task.FileSize, task.UploadDir);
        return new UploadTaskDto
        {
            UploadId = task.Id,
            FileName = task.FileName,
            FileSize = task.FileSize,
            FileMd5 = task.FileMd5 ?? string.Empty,
            ChunkSize = task.ChunkSize,
            UploadedSize = uploadedChunkInfo.UploadedSize,
            TotalChunks = task.TotalChunks,
            UploadedChunksNum = uploadedChunkInfo.UploadedChunks,
            MaxUploadedChunkIndex = uploadedChunkInfo.MaxUploadedIndex,
            MissingChunksInUploadedRange = uploadedChunkInfo.MissingChunksInUploadedRange,
            Progress = task.FileSize > 0 ? (double)uploadedChunkInfo.UploadedSize / task.FileSize : 0,
            Status = GetStatusString(task.Status),
            CreatedAt = task.CreatedAt.ToString("o"),
            UpdatedAt = task.UpdatedAt.ToString("o"),
            IsNew = false
        };
    }

    private static string GetStatusString(int status) => status switch
    {
        0 => "pending",
        1 => "uploading",
        2 => "completed",
        3 => "cancelled",
        4 => "failed",
        _ => "unknown"
    };

    #region 文件夹上传

    public async Task<FolderUploadTaskDto> CreateFolderUploadTaskAsync(CreateFolderUploadRequest request)
    {
        var folderId = Guid.NewGuid().ToString();
        var uploadFolder = new UploadFolder
        {
            Id = folderId,
            FolderName = request.folder_name,
            TotalFiles = request.total_files,
            CompletedFiles = 0,
            TotalSize = request.total_size,
            UploadedSize = 0,
            Status = 0, // 待上传
            RootPath = request.root_path,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.UploadFolders.Add(uploadFolder);
        await _context.SaveChangesAsync();

        // 创建文件夹上传目录
        var folderUploadDir = Path.Combine(_settings.UploadPath, "folders", folderId);
        Directory.CreateDirectory(folderUploadDir);

        _logger.LogInformation("Created folder upload task {FolderId} for folder {FolderName} with {FileCount} files",
            folderId, request.folder_name, request.total_files);

        return MapFolderToDto(uploadFolder);
    }

    public async Task<FolderUploadTaskDto> GetFolderUploadProgressAsync(string folderId)
    {
        var folder = await _context.UploadFolders
            .Include(f => f.Files)
            .FirstOrDefaultAsync(f => f.Id == folderId)
            ?? throw new InvalidOperationException($"Folder upload task not found: {folderId}");

        // 计算当前进度
        await UpdateFolderProgressAsync(folder);

        return MapFolderToDto(folder);
    }

    public async Task<List<FolderUploadTaskDto>> GetAllFolderUploadTasksAsync()
    {
        var folders = await _context.UploadFolders
            .Include(f => f.Files)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync();

        foreach (var folder in folders)
        {
            await UpdateFolderProgressAsync(folder);
        }

        return [.. folders.Select(MapFolderToDto)];
    }

    public async Task<bool> DeleteFolderUploadTaskAsync(string folderId)
    {
        var folder = await _context.UploadFolders
            .Include(f => f.Files)
            .FirstOrDefaultAsync(f => f.Id == folderId);

        if (folder == null) return false;

        // 删除所有关联的上传任务
        foreach (var task in folder.Files)
        {
            _context.UploadTasks.Remove(task);
        }

        _context.UploadFolders.Remove(folder);
        await _context.SaveChangesAsync();

        // 删除文件夹上传目录
        var folderUploadDir = Path.Combine(_settings.UploadPath, "folders", folderId);
        if (Directory.Exists(folderUploadDir))
        {
            Directory.Delete(folderUploadDir, true);
        }

        // 删除 staging 中的文件夹（如果存在）
        var stagingFolderDir = Path.Combine(_settings.StagingPath, "folders", folderId);
        if (Directory.Exists(stagingFolderDir))
        {
            Directory.Delete(stagingFolderDir, true);
        }

        _logger.LogInformation("Deleted folder upload task {FolderId}", folderId);
        return true;
    }

    public async Task<UploadTaskDto> AddFileToFolderAsync(string folderId, AddFileToFolderRequest request)
    {
        // 验证文件夹任务存在
        var folder = await _context.UploadFolders.FindAsync(folderId)
            ?? throw new InvalidOperationException($"Folder upload task not found: {folderId}");

        // 验证文件大小
        if (request.file_size > _settings.MaxFileSize)
        {
            throw new InvalidOperationException($"File size exceeds maximum allowed size of {_settings.MaxFileSize} bytes");
        }

        // 根据 MD5 查找已有任务
        var existingTask = await _context.UploadTasks
            .Where(t => t.FileMd5 == request.file_md5 && t.FolderId == folderId && t.Status != 2)
            .FirstOrDefaultAsync();

        if (existingTask == null)
        {
            // 创建新任务
            var uploadId = Guid.NewGuid().ToString();
            var totalChunks = (int)Math.Ceiling((double)request.file_size / request.chunk_size);

            // 创建上传目录
            var uploadDir = Path.Combine(_settings.UploadPath, "folders", folderId, uploadId);
            Directory.CreateDirectory(uploadDir);
            Directory.CreateDirectory(Path.Combine(uploadDir, "chunks"));

            var uploadTask = new UploadTask
            {
                Id = uploadId,
                FileName = request.file_name,
                FileSize = request.file_size,
                FileMd5 = request.file_md5,
                ChunkSize = request.chunk_size,
                TotalChunks = totalChunks,
                UploadedChunksNum = 0,
                UploadedSize = 0,
                Status = 0, // 待上传
                FolderId = folderId,
                RelativePath = request.relative_path,
                UploadDir = uploadDir,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.UploadTasks.Add(uploadTask);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Added file {FileName} to folder upload task {FolderId} with upload task {UploadId}",
                request.file_name, folderId, uploadId);

            return new UploadTaskDto
            {
                UploadId = uploadId,
                FileName = request.file_name,
                FileSize = request.file_size,
                FileMd5 = request.file_md5,
                ChunkSize = request.chunk_size,
                TotalChunks = totalChunks,
                UploadedChunksNum = 0,
                UploadedSize = 0,
                MaxUploadedChunkIndex = -1,
                MissingChunksInUploadedRange = [],
                Progress = 0,
                Status = "pending",
                CreatedAt = DateTime.UtcNow.ToString("o"),
                IsNew = true
            };
        }
        else
        {
            // 返回已有任务信息
            _logger.LogInformation("Found existing upload task {UploadId} for file {FileName} in folder {FolderId}",
                existingTask.Id, request.file_name, folderId);
            var uploadedChunkInfo = CalculateUploadedChunk(existingTask.Id, existingTask.TotalChunks, existingTask.ChunkSize, existingTask.FileSize, existingTask.UploadDir);

            return new UploadTaskDto
            {
                UploadId = existingTask.Id,
                FileName = existingTask.FileName,
                FileSize = existingTask.FileSize,
                FileMd5 = existingTask.FileMd5 ?? string.Empty!,
                ChunkSize = existingTask.ChunkSize,
                TotalChunks = existingTask.TotalChunks,
                UploadedChunksNum = uploadedChunkInfo.UploadedChunks,
                UploadedSize = uploadedChunkInfo.UploadedSize,
                MaxUploadedChunkIndex = uploadedChunkInfo.MaxUploadedIndex,
                MissingChunksInUploadedRange = uploadedChunkInfo.MissingChunksInUploadedRange,
                Progress = existingTask.FileSize > 0 ? (double)uploadedChunkInfo.UploadedSize / existingTask.FileSize : 0,
                Status = GetStatusString(existingTask.Status),
                CreatedAt = existingTask.CreatedAt.ToString("o"),
                UpdatedAt = existingTask.UpdatedAt.ToString("o"),
                IsNew = false
            };
        }
    }

    private async Task UpdateFolderProgressAsync(UploadFolder folder)
    {
        // 计算已完成文件数和已上传大小
        folder.UploadedSize = folder.Files.Sum(f => f.UploadedSize);
        folder.CompletedFiles = folder.Files.Count(f => f.Status == 2);

        // 更新文件夹状态
        if (folder.CompletedFiles == folder.TotalFiles)
        {
            folder.Status = 2; // 已完成
            folder.CompletedAt = DateTime.UtcNow;
        }
        else if (folder.CompletedFiles > 0 || folder.UploadedSize > 0)
        {
            folder.Status = 1; // 上传中
        }
        folder.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
    }

    private FolderUploadTaskDto MapFolderToDto(UploadFolder folder)
    {
        var progress = folder.TotalSize > 0 ? (double)folder.UploadedSize / folder.TotalSize : 0;

        var files = folder.Files.Select(f =>
        {
            var uploadedChunkInfo = CalculateUploadedChunk(f.Id, f.TotalChunks, f.ChunkSize, f.FileSize, f.UploadDir);
            return new FileUploadInfo
            {
                UploadId = f.Id,
                FileName = f.FileName,
                RelativePath = f.RelativePath,
                FileSize = f.FileSize,
                UploadedSize = uploadedChunkInfo.UploadedSize,
                Progress = f.FileSize > 0 ? (double)uploadedChunkInfo.UploadedSize / f.FileSize : 0,
                Status = GetStatusString(f.Status)
            };
        }).ToList();

        return new FolderUploadTaskDto
        {
            FolderId = folder.Id,
            FolderName = folder.FolderName,
            TotalFiles = folder.TotalFiles,
            CompletedFiles = folder.CompletedFiles,
            TotalSize = folder.TotalSize,
            UploadedSize = folder.UploadedSize,
            Progress = progress,
            Status = GetStatusString(folder.Status),
            Files = files,
            CreatedAt = folder.CreatedAt.ToString("o"),
            UpdatedAt = folder.UpdatedAt.ToString("o")
        };
    }

    #endregion
}
