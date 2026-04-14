using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

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
            UploadedChunks = 0,
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
            upload_id = uploadId,
            total_chunks = totalChunks,
            status = "pending"
        };
    }

    public async Task<UploadProgressDto?> FindByMd5Async(string fileMd5)
    {
        var task = await _context.UploadTasks
            .Where(t => t.FileMd5 == fileMd5 && t.Status != 2) // 不是已完成
            .FirstOrDefaultAsync();

        if (task == null)
        {
            return null;
        }

        return MapToDto(task);
    }

    public async Task<UploadProgressDto> GetUploadProgressAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null)
        {
            throw new InvalidOperationException($"Upload task not found: {uploadId}");
        }

        return MapToDto(task);
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

    public async Task<List<UploadProgressDto>> GetAllUploadTasksAsync()
    {
        var tasks = await _context.UploadTasks.ToListAsync();
        return tasks.Select(MapToDto).ToList();
    }

    public async Task<MergeResponse> MergeAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null)
        {
            return new MergeResponse
            {
                success = false,
                error = "Upload task not found"
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
        }

        if (missingChunks.Count > 0)
        {
            return new MergeResponse
            {
                success = false,
                error = "missing_chunks",
                missing_chunks = missingChunks.ToArray()
            };
        }

        // 合并分片
        var uploadDir = Path.Combine(_settings.UploadPath, uploadId);
        var mergedFile = Path.Combine(uploadDir, task.FileName);

        using var outputStream = new FileStream(mergedFile, FileMode.Create, FileAccess.Write);

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
            return new MergeResponse
            {
                success = false,
                error = "File size mismatch after merge"
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
            VideoPath = $"upload/{uploadId}/{task.FileName}",
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

        return new MergeResponse
        {
            success = true,
            data = new MergeData
            {
                media_id = mediaId,
                status = "completed"
            }
        };
    }

    private UploadProgressDto MapToDto(UploadTask task)
    {
        return new UploadProgressDto
        {
            upload_id = task.Id,
            file_name = task.FileName,
            file_size = task.FileSize,
            file_md5 = task.FileMd5 ?? string.Empty,
            chunk_size = task.ChunkSize,
            uploaded_size = task.UploadedSize,
            total_chunks = task.TotalChunks,
            uploaded_chunks = task.UploadedChunks,
            progress = task.FileSize > 0 ? (double)task.UploadedSize / task.FileSize : 0,
            status = GetStatusString(task.Status),
            created_at = task.CreatedAt.ToString("o"),
            updated_at = task.UpdatedAt.ToString("o")
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
