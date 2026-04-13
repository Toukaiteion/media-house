namespace MediaHouse.Interfaces;

public interface IChunkService
{
    Task<bool> UploadChunkAsync(string uploadId, int chunkIndex, Stream chunkData);
    Task<string?> CompleteUploadAsync(string uploadId);
}
