using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MediaHouse.Services;

public class ChunkService(
    MediaHouseDbContext context,
    IOptions<UploadSettings> uploadSettings,
    ILogger<ChunkService> logger) : IChunkService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _settings = uploadSettings.Value;
    private readonly ILogger<ChunkService> _logger = logger;
    private const int BufferSize = 81920; // 80KB buffer for faster copy

    public async Task<bool> UploadChunkAsync(string uploadId, int chunkIndex, Stream chunkData)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null)
        {
            throw new InvalidOperationException($"Upload task not found: {uploadId}");
        }

        if (task.Status == 2) // 已暂停
        {
            throw new InvalidOperationException($"Upload task is paused: {uploadId}");
        }

        if (task.Status == 3) // 已完成
        {
            throw new InvalidOperationException($"Upload task already completed: {uploadId}");
        }

        // 保存分片 - 使用更大的缓冲区
        var chunkDir = Path.Combine(_settings.UploadPath, uploadId, "chunks");
        var chunkFile = Path.Combine(chunkDir, $"{chunkIndex}.chunk");

        // 确保目录存在
        if (!Directory.Exists(chunkDir))
        {
            Directory.CreateDirectory(chunkDir);
        }

        // 使用超时保护保存文件
        var saveTask = Task.Run(async () =>
        {
            using var fileStream = new FileStream(chunkFile, FileMode.Create, FileAccess.Write, FileShare.None, BufferSize);
            await chunkData.CopyToAsync(fileStream, BufferSize);
            await fileStream.FlushAsync();
        });

        // 5分钟超时
        if (await Task.WhenAny(saveTask, Task.Delay(TimeSpan.FromMinutes(5))) == saveTask)
        {
            await saveTask;
        }
        else
        {
            throw new TimeoutException($"Timeout saving chunk {chunkIndex} for upload {uploadId}");
        }

        var chunkSize = new FileInfo(chunkFile).Length;

        // 更新任务状态 - 使用超时保护
        var updateTask = Task.Run(async () =>
        {
            task.UploadedChunks++;
            task.UploadedSize += chunkSize;
            task.Status = 1; // 上传中
            task.UpdatedAt = DateTime.UtcNow;

            // 检查是否完成
            if (task.UploadedChunks >= task.TotalChunks)
            {
                task.Status = 3; // 已完成
                task.CompletedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
        });

        // 30秒超时更新数据库
        if (await Task.WhenAny(updateTask, Task.Delay(TimeSpan.FromSeconds(30))) == updateTask)
        {
            await updateTask;
        }
        else
        {
            _logger.LogWarning("Database update timeout for chunk {ChunkIndex}, but file saved successfully", chunkIndex);
            // 文件已保存，虽然数据库更新失败，但返回成功
        }

        _logger.LogDebug("Uploaded chunk {ChunkIndex} ({Size} bytes) for task {UploadId}", chunkIndex, chunkSize, uploadId);
        return true;
    }

    public async Task<string?> CompleteUploadAsync(string uploadId)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null)
        {
            throw new InvalidOperationException($"Upload task not found: {uploadId}");
        }

        if (task.Status != 3) // 未完成
        {
            throw new InvalidOperationException($"Upload task not completed: {uploadId}");
        }

        // 合并分片
        var uploadDir = Path.Combine(_settings.UploadPath, uploadId);
        var chunkDir = Path.Combine(uploadDir, "chunks");
        var mergedFile = Path.Combine(uploadDir, task.FileName);

        using var outputStream = new FileStream(mergedFile, FileMode.Create, FileAccess.Write);

        for (int i = 0; i < task.TotalChunks; i++)
        {
            var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
            if (!File.Exists(chunkFile))
            {
                throw new InvalidOperationException($"Chunk {i} not found for upload task: {uploadId}");
            }

            using var inputStream = new FileStream(chunkFile, FileMode.Open, FileAccess.Read);
            await inputStream.CopyToAsync(outputStream);
        }

        // 验证文件大小
        var fileInfo = new FileInfo(mergedFile);
        if (fileInfo.Length != task.FileSize)
        {
            throw new InvalidOperationException($"Merged file size mismatch for upload task: {uploadId}");
        }

        _logger.LogInformation("Completed upload task {UploadId}, merged file: {FilePath}", uploadId, mergedFile);

        return mergedFile;
    }
}
