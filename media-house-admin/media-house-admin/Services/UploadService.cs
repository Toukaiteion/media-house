using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MediaHouse.DTOs.Upload;
using MediaHouse.Config;
using System.Text.Json;

namespace MediaHouse.Services;

public class UploadService(
    MediaHouseDbContext context,
    IOptions<UploadSettings> uploadSettings,
    IHostEnvironment environment,
    ILogger<UploadService> logger,
    IMetadataService metadataService) : IUploadService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _settings = uploadSettings.Value;
    private readonly IHostEnvironment _environment = environment;
    private readonly ILogger<UploadService> _logger = logger;
    private readonly IMetadataService _metadataService = metadataService;

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

        // 合并分片并验证文件大小
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
                Error = $"File size mismatch after merge - expected: {task.FileSize}, actual: {fileInfo.Length}"
            };
        }

        return new MergeResponse
        {
            Success = true,
            Data = new MergeData
            {
                MediaId = string.Empty,
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

    #region StagingMedia 生成

    public async Task<StagingMediaResult> CreateStagingMediaFromTaskAsync(string uploadTaskId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadTaskId);
        if (task == null)
        {
            return new StagingMediaResult
            {
                Success = false,
                Error = "Upload task not found"
            };
        }

        // 验证所有分片是否完整
        var uploadDir = !string.IsNullOrEmpty(task.UploadDir)
            ? task.UploadDir
            : Path.Combine(_settings.UploadPath, task.Id);

        var chunkDir = Path.Combine(uploadDir, "chunks");
        var missingChunks = new List<int>();

        for (int i = 0; i < task.TotalChunks; i++)
        {
            var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
            if (!File.Exists(chunkFile))
            {
                missingChunks.Add(i);
            }
        }

        if (missingChunks.Count > 0)
        {
            return new StagingMediaResult
            {
                Success = false,
                Error = $"Missing chunks: {string.Join(", ", missingChunks)}"
            };
        }

        // 创建 stagingMedia（不扫描 NFO）
        return await CreateStagingMediaInternalAsync(task, scanNfo: false);
    }

    public async Task<StagingMediaResult> CreateStagingMediaFromFolderAsync(string uploadFolderId)
    {
        var folder = await _context.UploadFolders
            .Include(f => f.Files)
            .FirstOrDefaultAsync(f => f.Id == uploadFolderId);

        if (folder == null)
        {
            return new StagingMediaResult
            {
                Success = false,
                Error = "Folder upload task not found"
            };
        }

        // 查找主视频文件（扩展名为视频格式）
        var videoTask = folder.Files.FirstOrDefault(t =>
        {
            var ext = Path.GetExtension(t.FileName).ToLower();
            return new[] { ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm" }.Contains(ext);
        });

        if (videoTask == null)
        {
            return new StagingMediaResult
            {
                Success = false,
                Error = "No video file found in folder"
            };
        }

        // 验证视频文件的所有分片是否完整
        var uploadDir = !string.IsNullOrEmpty(videoTask.UploadDir)
            ? videoTask.UploadDir
            : Path.Combine(_settings.UploadPath, "folders", folder.Id, videoTask.Id);

        var chunkDir = Path.Combine(uploadDir, "chunks");
        var missingChunks = new List<int>();

        for (int i = 0; i < videoTask.TotalChunks; i++)
        {
            var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
            if (!File.Exists(chunkFile))
            {
                missingChunks.Add(i);
            }
        }

        if (missingChunks.Count > 0)
        {
            return new StagingMediaResult
            {
                Success = false,
                Error = $"Video file missing chunks: {string.Join(", ", missingChunks)}"
            };
        }

        // 创建一条 stagingMedia 记录（包含所有文件：视频 + NFO + 图片）
        return await CreateStagingMediaForFolderAsync(folder, videoTask);
    }

    /// <summary>
    /// 合并分片文件
    /// </summary>
    private async Task MergeChunksAsync(string uploadDir, UploadTask task)
    {
        var chunkDir = Path.Combine(uploadDir, "chunks");
        var mergedFile = Path.Combine(uploadDir, task.FileName);

        using var outputStream = new FileStream(mergedFile, FileMode.Create, FileAccess.Write);

        for (int i = 0; i < task.TotalChunks; i++)
        {
            var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
            using var inputStream = new FileStream(chunkFile, FileMode.Open, FileAccess.Read);
            await inputStream.CopyToAsync(outputStream);
        }
    }

    /// <summary>
    /// 创建 stagingMedia 记录的内部方法
    /// </summary>
    /// <param name="task">上传任务</param>
    /// <param name="scanNfo">是否扫描 NFO 文件</param>
    /// <returns>StagingMedia 结果</returns>
    private async Task<StagingMediaResult> CreateStagingMediaInternalAsync(UploadTask task, bool scanNfo = false)
    {
        var mediaId = Guid.NewGuid().ToString();
        string stagingDir;
        string stagingFile;
        var uploadDir = !string.IsNullOrEmpty(task.UploadDir)
            ? task.UploadDir
            : Path.Combine(_settings.UploadPath, task.Id);

        // 合并文件（如果尚未合并）
        var mergedFile = Path.Combine(uploadDir, task.FileName);
        if (!File.Exists(mergedFile))
        {
            await MergeChunksAsync(uploadDir, task);
        }

        // 确定目标路径
        if (!string.IsNullOrEmpty(task.FolderId))
        {
            // 文件夹上传：staging/folders/{folder_id}/{relative_path}/
            var folderStagingDir = Path.Combine(_settings.StagingPath, "folders", task.FolderId);
            var relativeDir = !string.IsNullOrEmpty(task.RelativePath)
                ? Path.GetDirectoryName(task.RelativePath) ?? ""
                : "";

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

        // 移动文件
        if (File.Exists(mergedFile))
        {
            File.Move(mergedFile, stagingFile);
        }
        else
        {
            return new StagingMediaResult
            {
                Success = false,
                Error = "Merged file not found"
            };
        }

        // 创建 stagingMedia 实体
        var stagingMedia = new StagingMedia
        {
            Id = mediaId,
            UploadTaskId = task.Id,
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

        // 扫描 NFO（如果需要）
        if (scanNfo)
        {
            await ScanAndPopulateMetadataAsync(stagingMedia, stagingDir);
        }

        _context.StagingMedias.Add(stagingMedia);
        await _context.SaveChangesAsync();

        // 更新任务状态
        task.Status = 2; // 已完成
        task.UpdatedAt = DateTime.UtcNow;
        task.CompletedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // 删除上传目录（包含 chunks）
        if (Directory.Exists(uploadDir))
        {
            Directory.Delete(uploadDir, true);
        }

        _logger.LogInformation("Created staging media {StagingId} from upload task {UploadId}", mediaId, task.Id);

        return new StagingMediaResult
        {
            Success = true,
            StagingMediaId = mediaId,
            Message = "Staging media created successfully"
        };
    }

    /// <summary>
    /// 为文件夹上传创建 stagingMedia 记录（包含视频 + NFO + 图片）
    /// </summary>
    private async Task<StagingMediaResult> CreateStagingMediaForFolderAsync(UploadFolder folder, UploadTask videoTask)
    {
        var mediaId = Guid.NewGuid().ToString();
        var folderStagingDir = Path.Combine(_settings.StagingPath, "folders", folder.Id);
        Directory.CreateDirectory(folderStagingDir);

        // 1. 先验证所有任务的分片完整性
        foreach (var task in folder.Files)
        {
            var uploadDir = !string.IsNullOrEmpty(task.UploadDir)
                ? task.UploadDir
                : Path.Combine(_settings.UploadPath, "folders", folder.Id, task.Id);

            var chunkDir = Path.Combine(uploadDir, "chunks");
            var missingChunks = new List<int>();

            for (int i = 0; i < task.TotalChunks; i++)
            {
                var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
                if (!File.Exists(chunkFile))
                {
                    missingChunks.Add(i);
                }
            }

            if (missingChunks.Count > 0)
            {
                return new StagingMediaResult
                {
                    Success = false,
                    Error = $"Task {task.Id} ({task.FileName}): Missing chunks"
                };
            }
        }

        // 2. 遍历所有文件，合并并移动到 staging 目录
        foreach (var task in folder.Files)
        {
            var uploadDir = !string.IsNullOrEmpty(task.UploadDir)
                ? task.UploadDir
                : Path.Combine(_settings.UploadPath, "folders", folder.Id, task.Id);

            // 合并文件（如果尚未合并）
            var mergedFile = Path.Combine(uploadDir, task.FileName);
            if (!File.Exists(mergedFile))
            {
                await MergeChunksAsync(uploadDir, task);
            }

            // 根据 RelativePath 确定目标位置
            // 如果 RelativePath 为空，放在根目录；否则按照相对路径放置
            string targetPath;
            if (string.IsNullOrEmpty(task.RelativePath))
            {
                // 根目录文件
                targetPath = Path.Combine(folderStagingDir, task.FileName);
            }
            else
            {
                // 有相对路径的文件，保持目录结构
                targetPath = Path.Combine(folderStagingDir, task.RelativePath);
                var targetDir = Path.GetDirectoryName(targetPath);
                if (!string.IsNullOrEmpty(targetDir) && !Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }
            }

            // 移动文件
            if (File.Exists(mergedFile))
            {
                File.Move(mergedFile, targetPath);
                _logger.LogInformation("Moved {FileName} from {Source} to {Target}", task.FileName, uploadDir, targetPath);
            }
        }

        // 3. 创建 stagingMedia 实体
        var relativeDir = !string.IsNullOrEmpty(videoTask.RelativePath)
                ? Path.GetDirectoryName(videoTask.RelativePath) ?? ""
                : "";
        var stagingVideoFile = Path.Combine(folderStagingDir, relativeDir, videoTask.FileName);
        var stagingMedia = new StagingMedia
        {
            Id = mediaId,
            UploadTaskId = videoTask.Id,
            FolderId = folder.Id,
            Type = "movie",
            Title = folder.FolderName, // 使用文件夹名称作为默认标题
            VideoPath = GetAbsolutePath(stagingVideoFile),
            VideoSize = videoTask.FileSize,
            Status = 0, // 待编辑
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        // 4. 扫描 NFO 并填充元数据
        await ScanAndPopulateMetadataAsync(stagingMedia, folderStagingDir);

        _context.StagingMedias.Add(stagingMedia);
        await _context.SaveChangesAsync();

        // 5. 更新所有文件任务的状态为已完成
        foreach (var task in folder.Files)
        {
            task.Status = 2; // 已完成
            task.UpdatedAt = DateTime.UtcNow;
            task.CompletedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();

        // 6. 删除所有上传目录
        foreach (var task in folder.Files)
        {
            var taskUploadDir = !string.IsNullOrEmpty(task.UploadDir)
                ? task.UploadDir
                : Path.Combine(_settings.UploadPath, "folders", folder.Id, task.Id);

            if (Directory.Exists(taskUploadDir))
            {
                Directory.Delete(taskUploadDir, true);
            }
        }

        _logger.LogInformation("Created staging media {StagingId} from folder {FolderId} with {FileCount} files",
            mediaId, folder.Id, folder.Files.Count);

        return new StagingMediaResult
        {
            Success = true,
            StagingMediaId = mediaId,
            Message = $"Staging media created from folder with {folder.Files.Count} files"
        };
    }

    /// <summary>
    /// 扫描 NFO 文件并填充元数据到 stagingMedia
    /// </summary>
    private async Task ScanAndPopulateMetadataAsync(StagingMedia stagingMedia, string stagingDir)
    {
        // 查找 NFO 文件（在视频所在目录）
        var nfoFiles = Directory.GetFiles(stagingDir, "*.nfo", SearchOption.AllDirectories);
        if (nfoFiles.Length == 0)
        {
            _logger.LogInformation("No NFO file found in {Dir}", stagingDir);
            return;
        }

        var nfoFile = nfoFiles[0];
        var parseResult = await _metadataService.ParseNfoFileFullAsync(nfoFile);

        if (parseResult == null)
        {
            _logger.LogWarning("Failed to parse NFO file: {File}", nfoFile);
            return;
        }

        // 填充 stagingMedia 字段
        stagingMedia.Title = parseResult.Title;
        stagingMedia.OriginalTitle = parseResult.Title;
        stagingMedia.Year = parseResult.Year;
        stagingMedia.ReleaseDate = parseResult.Premiered;
        stagingMedia.Studio = parseResult.Studios;
        stagingMedia.Runtime = parseResult.Runtime;
        stagingMedia.Description = parseResult.Summary;

        // 处理标签
        if (parseResult.Tags != null)
        {
            var tags = parseResult.Tags.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(t => t.Trim()).ToList();
            stagingMedia.Tags = JsonSerializer.Serialize(tags);
        }

        // 处理演员
        if (parseResult.Actors != null && parseResult.Actors.Count > 0)
        {
            var staff = parseResult.Actors.Select(a => new StaffItemDto { Name = a, Type = "actor" }).ToList();
            stagingMedia.Staff = JsonSerializer.Serialize(staff);
        }

        // 处理图片（如果存在则创建 media_imgs 记录）
        var imageTypes = new[] { "poster", "thumb", "fanart" };
        foreach (var imageType in imageTypes)
        {
            if (parseResult.ImagePaths.TryGetValue(imageType, out var imagePath) && !string.IsNullOrEmpty(imagePath))
            {
                var fullPath = Path.Combine(stagingDir, imagePath);
                if (File.Exists(fullPath))
                {
                    var urlName = await CreateMediaImgRecordAsync(fullPath, imageType);
                    switch (imageType)
                    {
                        case "poster":
                            stagingMedia.PosterPath = urlName;
                            break;
                        case "thumb":
                            stagingMedia.ThumbPath = urlName;
                            break;
                        case "fanart":
                            stagingMedia.FanartPath = urlName;
                            break;
                    }
                }
            }
        }

        // 处理截图（extrafanart 目录）
        var extrafanartDir = Path.Combine(stagingDir, "extrafanart");
        if (Directory.Exists(extrafanartDir))
        {
            var screenshotFiles = Directory.GetFiles(extrafanartDir)
                .Where(f => new[] { ".jpg", ".jpeg", ".png", ".webp" }.Contains(Path.GetExtension(f).ToLower()));

            var screenshotUrlNames = new List<string>();
            foreach (var screenshotFile in screenshotFiles)
            {
                var urlName = await CreateMediaImgRecordAsync(screenshotFile, "screenshot");
                screenshotUrlNames.Add(urlName);
            }

            if (screenshotUrlNames.Count > 0)
            {
                stagingMedia.ScreenshotsPath = string.Join(",", screenshotUrlNames);
            }
        }

        stagingMedia.Status = 1; // 待发布
        stagingMedia.UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// 创建 media_imgs 记录并返回 url_name
    /// </summary>
    private async Task<string> CreateMediaImgRecordAsync(string filePath, string type)
    {
        var urlName = MediaUtils.GenerateUrlNameFromPath(filePath);
        var fileInfo = new FileInfo(filePath);

        var mediaImg = new MediaImgs
        {
            MediaId = 0, // 暂存媒体
            UrlName = urlName,
            Name = Path.GetFileNameWithoutExtension(filePath),
            Path = filePath,
            FileName = Path.GetFileName(filePath),
            Extension = Path.GetExtension(filePath).TrimStart('.'),
            Type = type,
            SizeBytes = fileInfo.Length,
            CreateTime = DateTime.UtcNow,
            UpdateTime = DateTime.UtcNow
        };

        var existing = await _context.MediaImgs.FirstOrDefaultAsync(m => m.Path == filePath);
        if (existing == null)
        {
            _context.MediaImgs.Add(mediaImg);
            await _context.SaveChangesAsync();
        }
        else
        {
            urlName = existing.UrlName;
        }

        return urlName;
    }

    #endregion
}
