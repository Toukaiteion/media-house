using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IChunkService
{
    Task<bool> UploadChunkAsync(string uploadId, UploadChunkRequest request);
    Task<CheckChunksResponse> CheckChunksAsync(string uploadId, int index);
}
