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

    public async Task<CreateUploadTaskResponse> CreateUploadTaskAsync(CreateUploadRequest request)
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

            return new CreateUploadTaskResponse
            {
                upload_id = uploadId,
                file_name = request.file_name,
                file_size = request.file_size,
                file_md5 = request.file_md5,
                chunk_size = request.chunk_size,
                total_chunks = totalChunks,
                uploaded_chunks = 0,
                uploaded_size = 0,
                start_chunk_index = 0,
                progress = 0,
                status = "pending",
                created_at = DateTime.UtcNow.ToString("o"),
                is_new = true
            };
        }
        else
        {
            // 返回已有任务信息
            _logger.LogInformation("Found existing upload task {UploadId} for file {FileName}", existingTask.Id, request.file_name);

            return new CreateUploadTaskResponse
            {
                upload_id = existingTask.Id,
                file_name = existingTask.FileName,
                file_size = existingTask.FileSize,
                file_md5 = existingTask.FileMd5 ?? string.Empty!,
                chunk_size = existingTask.ChunkSize,
                total_chunks = existingTask.TotalChunks,
                uploaded_chunks = existingTask.UploadedChunks,
                uploaded_size = existingTask.UploadedSize,
                start_chunk_index = existingTask.UploadedChunks,
                progress = existingTask.FileSize > 0 ? (double)existingTask.UploadedSize / existingTask.FileSize : 0,
                status = GetStatusString(existingTask.Status),
                created_at = existingTask.CreatedAt.ToString("o"),
                updated_at = existingTask.UpdatedAt.ToString("o"),
                is_new = false
            };
        }
    }

    public async Task<UploadProgressDto> GetUploadProgressAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId) ?? throw new InvalidOperationException($"Upload task not found: {uploadId}");

        return MapToDto(task);
    }

    public async Task<List<UploadProgressDto>> GetAllUploadTasksAsync()
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
