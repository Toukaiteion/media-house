using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IPlayRecordRepository : IRepository<PlayRecord>
{
    Task<PlayRecord?> GetByUserAndMediaAsync(int userId, int mediaId);
    Task<List<PlayRecord>> GetByUserAsync(int userId);
    Task<List<PlayRecord>> GetRecentAsync(int userId, int limit = 10);
}
