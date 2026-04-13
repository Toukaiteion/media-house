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
        if (request.FileSize > _settings.MaxFileSize)
        {
            throw new InvalidOperationException($"File size exceeds maximum allowed size of {_settings.MaxFileSize} bytes");
        }

        // 验证文件扩展名
        var extension = Path.GetExtension(request.FileName).ToLower();
        if (!_settings.AllowedExtensions.Contains(extension))
        {
            throw new InvalidOperationException($"File extension {extension} is not allowed");
        }

        var uploadId = Guid.NewGuid().ToString();
        var totalChunks = (int)Math.Ceiling((double)request.FileSize / request.ChunkSize);

        var uploadTask = new UploadTask
        {
            Id = uploadId,
            FileName = request.FileName,
            FileSize = request.FileSize,
            ChunkSize = request.ChunkSize,
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

        _logger.LogInformation("Created upload task {UploadId} for file {FileName}", uploadId, request.FileName);

        return new UploadTaskDto
        {
            UploadId = uploadId,
            FileName = request.FileName,
            FileSize = request.FileSize,
            TotalChunks = totalChunks,
            Status = "pending"
        };
    }

    public async Task<UploadProgressDto> GetUploadProgressAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null)
        {
            throw new InvalidOperationException($"Upload task not found: {uploadId}");
        }

        return new UploadProgressDto
        {
            UploadId = task.Id,
            FileName = task.FileName,
            FileSize = task.FileSize,
            UploadedSize = task.UploadedSize,
            TotalChunks = task.TotalChunks,
            UploadedChunks = task.UploadedChunks,
            Progress = task.FileSize > 0 ? (double)task.UploadedSize / task.FileSize : 0,
            Status = GetStatusString(task.Status)
        };
    }

    public async Task<bool> PauseUploadAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null) return false;

        task.Status = 2; // 已暂停
        task.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Paused upload task {UploadId}", uploadId);
        return true;
    }

    public async Task<bool> ResumeUploadAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null) return false;

        task.Status = 1; // 上传中
        task.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Resumed upload task {UploadId}", uploadId);
        return true;
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
        return tasks.Select(t => new UploadProgressDto
        {
            UploadId = t.Id,
            FileName = t.FileName,
            FileSize = t.FileSize,
            UploadedSize = t.UploadedSize,
            TotalChunks = t.TotalChunks,
            UploadedChunks = t.UploadedChunks,
            Progress = t.FileSize > 0 ? (double)t.UploadedSize / t.FileSize : 0,
            Status = GetStatusString(t.Status)
        }).ToList();
    }

    private static string GetStatusString(int status) => status switch
    {
        0 => "pending",
        1 => "uploading",
        2 => "paused",
        3 => "completed",
        4 => "cancelled",
        5 => "failed",
        _ => "unknown"
    };
}
