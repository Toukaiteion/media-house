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

        // 保存分片
        var chunkDir = Path.Combine(_settings.UploadPath, uploadId, "chunks");
        var chunkFile = Path.Combine(chunkDir, $"{chunkIndex}.chunk");

        using var fileStream = new FileStream(chunkFile, FileMode.Create, FileAccess.Write);
        await chunkData.CopyToAsync(fileStream);

        var chunkSize = new FileInfo(chunkFile).Length;

        // 更新任务状态
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

        _logger.LogDebug("Uploaded chunk {ChunkIndex} for task {UploadId}", chunkIndex, uploadId);
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
