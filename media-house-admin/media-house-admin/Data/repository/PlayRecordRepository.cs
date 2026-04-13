using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data.repository;

public class PlayRecordRepository(MediaHouseDbContext context, ILogger<PlayRecordRepository> logger)
    : Repository<PlayRecord>(context, logger), Interfaces.IPlayRecordRepository
{
    public async Task<PlayRecord?> GetByUserAndMediaAsync(int userId, int mediaId)
    {
        return await _dbSet
            .FirstOrDefaultAsync(pr => pr.UserId == userId && pr.MediaId == mediaId);
    }

    public async Task<List<PlayRecord>> GetByUserAsync(int userId)
    {
        return await _dbSet
            .Where(pr => pr.UserId == userId)
            .OrderByDescending(pr => pr.LastPlayTime)
            .ToListAsync();
    }

    public async Task<List<PlayRecord>> GetRecentAsync(int userId, int limit = 10)
    {
        return await _dbSet
            .Where(pr => pr.UserId == userId && pr.LastPlayTime.HasValue)
            .OrderByDescending(pr => pr.LastPlayTime)
            .Take(limit)
            .ToListAsync();
    }
}
