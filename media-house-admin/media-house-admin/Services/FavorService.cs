using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class FavorService(MediaHouseDbContext context, ILogger<FavorService> logger) : IFavorService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<FavorService> _logger = logger;

    public async Task<(List<FavorDto> Favorites, int TotalCount)> GetUserFavoritesAsync(int userId, int page, int pageSize)
    {
        // Query user's favorites
        var query = _context.MyFavors
            .Include(f => f.User)
            .Where(f => f.UserId == userId);

        var totalCount = await query.CountAsync();

        var favorites = await query
            .OrderByDescending(f => f.CreateTime)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(f => new FavorDto
            {
                MediaId = f.MediaId.ToString(),
                MediaTitle = "", // Can be enhanced to load Media info
                PosterPath = "", // Can be enhanced to load Media poster
                CreatedAt = f.CreateTime
            })
            .ToListAsync();

        return (favorites, totalCount);
    }

    public async Task<bool> ToggleFavoriteAsync(int mediaId, int userId)
    {
        var existing = await _context.MyFavors
            .FirstOrDefaultAsync(f => f.MediaId == mediaId && f.UserId == userId);

        if (existing != null)
        {
            // Remove favorite
            _context.MyFavors.Remove(existing);
            await _context.SaveChangesAsync();
            return false; // Unfavorited
        }
        else
        {
            // Add favorite
            var favorite = new MyFavor
            {
                UserId = userId,
                LibraryId = 0, // TODO: Get from Media
                MediaType = "movie",
                MediaId = mediaId,
                CreateTime = DateTime.UtcNow
            };
            _context.MyFavors.Add(favorite);
            await _context.SaveChangesAsync();
            return true; // Favorited
        }
    }

    public async Task<bool> IsFavoritedAsync(int mediaId, int userId)
    {
        return await _context.MyFavors
            .AnyAsync(f => f.MediaId == mediaId && f.UserId == userId);
    }
}
