using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.DTOs;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MediaHouse.Services;

public class ChunkService(
    MediaHouseDbContext context,
    IOptions<UploadSettings> uploadSettings,
    IOptions<StagingSettings> stagingSettings,
    ILogger<ChunkService> logger) : IChunkService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _uploadSettings = uploadSettings.Value;
    private readonly ILogger<ChunkService> _logger = logger;
    private const int BufferSize = 81920; // 80KB buffer for faster copy

    public async Task<bool> UploadChunkAsync(string uploadId, UploadChunkRequest request)
    {
        var task = await _context.UploadTasks.FindAsync(uploadId);
        if (task == null)
        {
            throw new InvalidOperationException($"Upload task not found: {uploadId}");
        }

        if (task.Status == 2) // 已完成
        {
            throw new InvalidOperationException($"Upload task already completed: {uploadId}");
        }

        // 解码 base64 数据
        byte[] chunkData;
        try
        {
            chunkData = Convert.FromBase64String(request.chunk_data);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Invalid base64 data for chunk {request.chunk_index}: {ex.Message}");
        }

        // 保存分片
        var chunkDir = Path.Combine(_uploadSettings.UploadPath, uploadId, "chunks");
        var chunkFile = Path.Combine(chunkDir, $"{request.chunk_index}.chunk");

        // 确保目录存在
        if (!Directory.Exists(chunkDir))
        {
            Directory.CreateDirectory(chunkDir);
        }

        // 使用超时保护保存文件
        var saveTask = Task.Run(() =>
        {
            using var fileStream = new FileStream(chunkFile, FileMode.Create, FileAccess.Write, FileShare.None, BufferSize);
            fileStream.Write(chunkData, 0, chunkData.Length);
            fileStream.Flush();
        });

        // 5分钟超时
        if (await Task.WhenAny(saveTask, Task.Delay(TimeSpan.FromMinutes(5))) == saveTask)
        {
            await saveTask;
        }
        else
        {
            throw new TimeoutException($"Timeout saving chunk {request.chunk_index} for upload {uploadId}");
        }

        var chunkSize = chunkData.Length;

        // 更新任务状态
        var updateTask = Task.Run(async () =>
        {
            task.UploadedChunks++;
            task.UploadedSize += chunkSize;
            task.Status = 1; // 上传中
            task.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
        });

        // 30秒超时更新数据库
        if (await Task.WhenAny(updateTask, Task.Delay(TimeSpan.FromSeconds(30))) == updateTask)
        {
            await updateTask;
        }
        else
        {
            _logger.LogWarning("Database update timeout for chunk {ChunkIndex}, but file saved successfully", request.chunk_index);
        }

        _logger.LogDebug("Uploaded chunk {ChunkIndex} ({Size} bytes) for task {UploadId}", request.chunk_index, chunkSize, uploadId);
        return true;
    }

    public async Task<CheckChunksResponse> CheckChunksAsync(string uploadId, int index)
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

        var chunkDir = Path.Combine(_uploadSettings.UploadPath, uploadId, "chunks");
        var missingChunks = new List<int>();

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
                to_index = index,
                all_uploaded = missingChunks.Count == 0,
                missing_chunks = missingChunks.ToArray()
            }
        };
    }
}
