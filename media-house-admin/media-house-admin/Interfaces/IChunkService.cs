using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IChunkService
{
    Task<bool> UploadChunkAsync(string uploadId, int chunkIndex, long chunkSize, Stream data);
    Task<CheckChunksResponse> CheckChunksAsync(string uploadId, int? index);
}
