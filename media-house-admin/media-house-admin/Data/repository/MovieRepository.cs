using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data.repository;

public class MovieRepository(MediaHouseDbContext context, ILogger<MovieRepository> logger)
    : Repository<Movie>(context, logger), Interfaces.IMovieRepository
{
    public async Task<List<Movie>> GetByLibraryAsync(int libraryId)
    {
        return await _dbSet
            .Where(m => m.LibraryId == libraryId)
            .OrderBy(m => m.Num)
            .ToListAsync();
    }

    public async Task<Movie?> GetByTitleAsync(string title)
    {
        return await _dbSet
            .FirstOrDefaultAsync(m => m.Maker == title);
    }

    public async Task<List<Movie>> SearchAsync(string query)
    {
        return await _dbSet
            .Where(m => m.Maker == "test")
            .OrderBy(m => m.Num)
            .ToListAsync();
    }
}
