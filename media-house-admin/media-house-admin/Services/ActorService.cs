using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class ActorService(MediaHouseDbContext context, ILogger<ActorService> logger) : IActorService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<ActorService> _logger = logger;

    public async Task<(List<Staff> Actors, int TotalCount)> GetActorsAsync(int page, int pageSize, string? sortBy = null)
    {
        var query = _context.Staffs.AsQueryable();
        var totalCount = await query.CountAsync();

        var actors = await query
            .OrderBy(a => a.Id)
            .ToListAsync();

        // If sortBy is mediaCount, we need to get media counts and sort in memory
        if (sortBy?.ToLower() == "mediacount")
        {
            var actorIds = actors.Select(a => a.Id).ToList();
            var mediaCounts = await GetActorMediaCountsAsync(actorIds);
            actors = actors.OrderByDescending(a => mediaCounts.GetValueOrDefault(a.Id, 0)).ToList();
        }

        return (actors, totalCount);
    }

    public async Task<Dictionary<int, int>> GetActorMediaCountsAsync(IEnumerable<int> actorIds)
    {
        var counts = await _context.MediaStaffs
            .Where(ms => actorIds.Contains(ms.StaffId))
            .GroupBy(ms => ms.StaffId)
            .Select(g => new { StaffId = g.Key, Count = g.Count() })
            .ToListAsync();

        return counts.ToDictionary(c => c.StaffId, c => c.Count);
    }
}
