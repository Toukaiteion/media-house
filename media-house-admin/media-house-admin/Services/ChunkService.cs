using MediaHouse.Interfaces;
using MediaHouse.DTOs;
using MediaHouse.Data;
using Microsoft.Extensions.Options;
using MediaHouse.Config;

namespace MediaHouse.Services;

public class ChunkService(
    MediaHouseDbContext context,
    IOptions<UploadSettings> uploadSettings,
    ILogger<ChunkService> logger) : IChunkService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _uploadSettings = uploadSettings.Value;
    private readonly ILogger<ChunkService> _logger = logger;
    private const int BufferSize = 81920; // 80KB buffer for faster copy

    public async Task<bool> UploadChunkAsync(string uploadId, int chunkIndex, long chunkSize, Stream data)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId) ?? throw new InvalidOperationException($"Upload task not found: {uploadId}");

        if (task.Status == 2) // 已完成
        {
            throw new InvalidOperationException($"Upload task already completed: {uploadId}");
        }


        // 保存分片 - 使用保存的路径
        var uploadBasePath = !string.IsNullOrEmpty(task.UploadDir)
            ? task.UploadDir
            : Path.Combine(_uploadSettings.UploadPath, uploadId);

        var chunkDir = Path.Combine(uploadBasePath, "chunks");
        var chunkFile = Path.Combine(chunkDir, $"{chunkIndex}.chunk");

        // 确保目录存在
        if (!Directory.Exists(chunkDir))
        {
            Directory.CreateDirectory(chunkDir);
        }

        using (var fileStream = new FileStream(chunkFile, FileMode.Create, FileAccess.Write, FileShare.None, BufferSize, useAsync: true))
        {
            await data.CopyToAsync(fileStream);
        }

        // 5. 更新数据库状态
        // 简单的自增在并发下可能不准，但在分片上传场景通常可容忍
        // 或者使用 SQL 原子更新: await _context.Database.ExecuteSqlInterpolatedAsync(...)
        task.UploadedChunksNum++;
        task.UploadedSize += chunkSize;
        task.Status = 1; 
        task.UpdatedAt = DateTime.UtcNow;

        // 直接 await，EF Core 内部有 CommandTimeout 配置
        await _context.SaveChangesAsync();

        _logger.LogDebug("Uploaded chunk {ChunkIndex} ({Size} bytes) for task {UploadId}", chunkIndex, chunkSize, uploadId);
        return true;
    }

    public async Task<CheckChunksResponse> CheckChunksAsync(string uploadId, int? index)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null)
        {
            return new CheckChunksResponse
            {
                success = false,
                error = "Upload task not found"
            };
        }

        // 使用保存的路径
        var uploadBasePath = !string.IsNullOrEmpty(task.UploadDir)
            ? task.UploadDir
            : Path.Combine(_uploadSettings.UploadPath, uploadId);

        var chunkDir = Path.Combine(uploadBasePath, "chunks");
        var missingChunks = new List<int>();

        index ??= task.TotalChunks - 1; // 默认检查所有分片
        // 检查从 0 到 index 的所有分片
        for (int i = 0; i <= index && i < task.TotalChunks; i++)
        {
            var chunkFile = Path.Combine(chunkDir, $"{i}.chunk");
            if (!File.Exists(chunkFile))
            {
                missingChunks.Add(i);
            }
        }

        return new CheckChunksResponse
        {
            success = true,
            data = new CheckChunksData
            {
                upload_id = uploadId,
                from_index = 0,
                to_index = index ?? task.TotalChunks,
                all_uploaded = missingChunks.Count == 0,
                missing_chunks = [.. missingChunks]
            }
        };
    }
}
