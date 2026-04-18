using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MediaHouse.DTOs.Upload;
using MediaHouse.Config;

namespace MediaHouse.Services;

public class UploadService(
    MediaHouseDbContext context,
    IOptions<UploadSettings> uploadSettings,
    ILogger<UploadService> logger) : IUploadService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _settings = uploadSettings.Value;
    private readonly ILogger<UploadService> _logger = logger;

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
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.UploadTasks.Add(uploadTask);
            await _context.SaveChangesAsync();

            // 创建上传目录
            var uploadDir = Path.Combine(_settings.UploadPath, uploadId);
            Directory.CreateDirectory(uploadDir);
            Directory.CreateDirectory(Path.Combine(uploadDir, "chunks"));

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

        // 检查所有分片是否完整
        var chunkDir = Path.Combine(_settings.UploadPath, uploadId, "chunks");
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
                MissingChunks = [.. missingChunks]
            };
        }

        // 合并分片
        var uploadDir = Path.Combine(_settings.UploadPath, uploadId);
        var mergedFile = Path.Combine(uploadDir, task.FileName);

        var outputStream = new FileStream(mergedFile, FileMode.Create, FileAccess.Write);

        for (int i = 0; i < task.TotalChunks; i++)
        {
            var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
            using var inputStream = new FileStream(chunkFile, FileMode.Open, FileAccess.Read);
            await inputStream.CopyToAsync(outputStream);
        }

        // 验证文件大小
        var fileInfo = new FileInfo(mergedFile);
        if (fileInfo.Length != task.FileSize)
        {
            outputStream.Dispose();
            return new MergeResponse
            {
                Success = false,
                Error = "File size mismatch after merge"
            };
        }

        // 创建 staging_media 记录
        var mediaId = Guid.NewGuid().ToString();
        var stagingMedia = new StagingMedia
        {
            Id = mediaId,
            UploadTaskId = uploadId,
            Type = "movie",
            Title = Path.GetFileNameWithoutExtension(task.FileName),
            VideoPath = $"{_settings.StagingPath}/{mediaId}/{task.FileName}",
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

        // 释放 outputStream 以便移动文件
        outputStream.Dispose();

        // 创建 staging 目录并移动文件
        var stagingDir = Path.Combine(_settings.StagingPath, mediaId);
        Directory.CreateDirectory(stagingDir);

        var stagingFile = Path.Combine(stagingDir, task.FileName);
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

    private UploadedChunkInfo CalculateUploadedChunk(string uploadId, int totalChunks, int chunkSize, long fileSize)
    {
        var uploadedInfo = new UploadedChunkInfo
        {
            MaxUploadedIndex = -1,
            UploadedChunks = 0,
            UploadedSize = 0
        };
        var chunkDir = Path.Combine(_settings.UploadPath, uploadId, "chunks");

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
        var uploadedChunkInfo = CalculateUploadedChunk(task.Id, task.TotalChunks, task.ChunkSize, task.FileSize);
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
}
