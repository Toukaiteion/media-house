using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IChunkService
{
    Task<bool> UploadChunkAsync(string uploadId, int chunkIndex, Stream chunkData);
    Task<CheckChunksResponse> CheckChunksAsync(string uploadId, int index);
}
