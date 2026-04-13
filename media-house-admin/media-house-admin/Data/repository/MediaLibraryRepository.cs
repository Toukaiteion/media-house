using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data.repository;

public class MediaLibraryRepository(MediaHouseDbContext context, ILogger<MediaLibraryRepository> logger)
    : Repository<MediaLibrary>(context, logger), Interfaces.IMediaLibraryRepository
{
    public async Task<MediaLibrary?> GetByNameAsync(string name)
    {
        return await _dbSet
            .Include(ml => ml.Medias)
            .FirstOrDefaultAsync(ml => ml.Name == name);
    }

    public async Task<List<MediaLibrary>> GetByTypeAsync(LibraryType type)
    {
        return await _dbSet
            .Where(ml => ml.Type == type)
            .ToListAsync();
    }

    public async Task<List<MediaLibrary>> GetEnabledAsync()
    {
        return await _dbSet
            .Where(ml => ml.IsEnabled)
            .ToListAsync();
    }
}
