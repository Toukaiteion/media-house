using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IUploadService
{
    Task<UploadTaskDto> CreateUploadTaskAsync(CreateUploadRequest request);
    Task<UploadProgressDto?> FindByMd5Async(string fileMd5);
    Task<UploadProgressDto> GetUploadProgressAsync(string uploadId);
    Task<bool> DeleteUploadTaskAsync(string uploadId);
    Task<List<UploadProgressDto>> GetAllUploadTasksAsync();
    Task<MergeResponse> MergeAsync(string uploadId);
}
