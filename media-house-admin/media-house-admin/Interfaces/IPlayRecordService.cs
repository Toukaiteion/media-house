using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IPlayRecordService
{
    Task UpdatePlaybackProgressAsync(int userId, int mediaLibraryId, int mediaId, double positionSeconds);
    Task MarkAsCompletedAsync(int userId, int mediaLibraryId, int mediaId);
    Task<PlayRecord?> GetPlayRecordAsync(int mediaId, int userId);
    Task<PlayRecord> CreateOrUpdatePlayRecordAsync(int mediaId, int userId, double positionSeconds);
}
