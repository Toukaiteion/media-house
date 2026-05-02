using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IUploadService
{
    Task<UploadTaskDto> CreateUploadTaskAsync(CreateUploadRequest request);
    Task<UploadTaskDto> GetUploadProgressAsync(string uploadId);
    Task<List<UploadTaskDto>> GetAllUploadTasksAsync();
    Task<bool> DeleteUploadTaskAsync(string uploadId);
    Task<MergeResponse> MergeAsync(string uploadId);

    // 文件夹上传相关方法
    Task<FolderUploadTaskDto> CreateFolderUploadTaskAsync(CreateFolderUploadRequest request);
    Task<FolderUploadTaskDto> GetFolderUploadProgressAsync(string folderId);
    Task<List<FolderUploadTaskDto>> GetAllFolderUploadTasksAsync();
    Task<bool> DeleteFolderUploadTaskAsync(string folderId);
    Task<UploadTaskDto> AddFileToFolderAsync(string folderId, AddFileToFolderRequest request);
}
