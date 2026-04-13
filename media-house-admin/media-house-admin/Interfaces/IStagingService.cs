using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IStagingService
{
    Task<StagingMediaDto> CreateStagingMediaAsync(string uploadTaskId, CompleteUploadRequest request);
    Task<List<StagingMediaDto>> GetAllStagingMediasAsync();
    Task<StagingMediaDto?> GetStagingMediaAsync(string id);
    Task<StagingMediaDto?> UpdateStagingMetadataAsync(string id, UpdateStagingMetadataRequest request);
    Task<string?> UploadPosterAsync(string id, Stream imageData, string fileName);
    Task<string?> UploadFanartAsync(string id, Stream imageData, string fileName);
    Task<string?> UploadScreenshotAsync(string id, Stream imageData, string fileName);
    Task<bool> DeleteStagingMediaAsync(string id);
}
