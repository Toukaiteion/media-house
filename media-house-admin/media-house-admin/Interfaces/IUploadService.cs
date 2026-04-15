using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IUploadService
{
    Task<CreateUploadTaskResponse> CreateUploadTaskAsync(CreateUploadRequest request);
    Task<UploadProgressDto> GetUploadProgressAsync(string uploadId);
    Task<List<UploadProgressDto>> GetAllUploadTasksAsync();
    Task<bool> DeleteUploadTaskAsync(string uploadId);
    Task<MergeResponse> MergeAsync(string uploadId);
}
