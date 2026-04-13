using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IMediaFileService
{
    Task<MediaFile?> GetMediaFileByPathAsync(string path);
    Task<MediaFile?> GetMediaFileByIdAsync(int id);
    Task<MediaFile> CreateMediaFileAsync(string filePath, int? movieId = null, int? episodeId = null);
    Task<MediaFile?> UpdateMediaFileAsync(int id, MediaFile updatedFile);
    Task<bool> DeleteMediaFileAsync(int id);
    Task<List<MediaFile>> GetMediaFilesForLibraryAsync(int libraryId);
}
