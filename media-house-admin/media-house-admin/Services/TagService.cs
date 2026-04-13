using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class TagService(MediaHouseDbContext context, ILogger<TagService> logger) : ITagService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<TagService> _logger = logger;

    public async Task<(List<Tag> Tags, int TotalCount)> GetTagsAsync(int page, int pageSize, string? sortBy = null)
    {
        var query = _context.Tags.AsQueryable();
        var totalCount = await query.CountAsync();

        var tags = await query
            .OrderBy(t => t.Id)
            .ToListAsync();

        // If sortBy is mediaCount, we need to get media counts and sort in memory
        if (sortBy?.ToLower() == "mediacount")
        {
            var tagIds = tags.Select(t => t.Id).ToList();
            var mediaCounts = await GetTagMediaCountsAsync(tagIds);
            tags = tags.OrderByDescending(t => mediaCounts.GetValueOrDefault(t.Id, 0)).ToList();
        }

        return (tags, totalCount);
    }

    public async Task<Dictionary<int, int>> GetTagMediaCountsAsync(IEnumerable<int> tagIds)
    {
        var counts = await _context.MediaTags
            .Where(mt => tagIds.Contains(mt.TagId))
            .GroupBy(mt => mt.TagId)
            .Select(g => new { TagId = g.Key, Count = g.Count() })
            .ToListAsync();

        return counts.ToDictionary(c => c.TagId, c => c.Count);
    }
}
