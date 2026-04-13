using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IPlayRecordService
{
    Task<string> GetPlaybackUrlAsync(int mediaId, string mediaType); // movie or episode
    Task<PlayRecord?> GetPlaybackProgressAsync(int userId, int mediaLibraryId, int mediaId);
    Task UpdatePlaybackProgressAsync(int userId, int mediaLibraryId, int mediaId, double positionSeconds);
    Task MarkAsCompletedAsync(int userId, int mediaLibraryId, int mediaId);
    Task<PlayRecord?> GetPlayRecordAsync(int mediaId, int userId);
    Task<PlayRecord> CreateOrUpdatePlayRecordAsync(int mediaId, int userId, double positionSeconds);
}
