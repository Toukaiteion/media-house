using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IUploadService
{
    Task<UploadTaskDto> CreateUploadTaskAsync(CreateUploadRequest request);
    Task<UploadTaskDto> GetUploadProgressAsync(string uploadId);
    Task<List<UploadTaskDto>> GetAllUploadTasksAsync();
    Task<bool> DeleteUploadTaskAsync(string uploadId);
    Task<MergeResponse> MergeAsync(string uploadId);
}
