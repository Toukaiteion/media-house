using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IUploadService
{
    Task<UploadTaskDto> CreateUploadTaskAsync(CreateUploadRequest request);
    Task<UploadProgressDto> GetUploadProgressAsync(string uploadId);
    Task<bool> PauseUploadAsync(string uploadId);
    Task<bool> ResumeUploadAsync(string uploadId);
    Task<bool> DeleteUploadTaskAsync(string uploadId);
    Task<List<UploadProgressDto>> GetAllUploadTasksAsync();
}
