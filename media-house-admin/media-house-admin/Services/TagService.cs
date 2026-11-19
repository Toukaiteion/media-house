using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class TagService(MediaHouseDbContext context, ILogger<TagService> logger) : ITagService
{
    private const int MaxPageSize = 500;

    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<TagService> _logger = logger;

    public async Task<(List<Tag> Tags, int TotalCount)> GetTagsAsync(int page, int pageSize, string? sortBy = null)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 20 : Math.Min(pageSize, MaxPageSize);

        // 只列出至少还挂着一条关联的标签。
        // 删片、改 NFO 之后留下的空标签（关联行已被清掉）不会再出现在列表里。
        var query = _context.Tags.Where(t => t.MediaTags.Any());

        var totalCount = await query.CountAsync();

        List<Tag> tags;

        // 按影片数排序需要先聚合再排序，SQL 里没法直接分页，只能取出后在内存里切
        if (sortBy?.ToLower() == "mediacount")
        {
            var all = await query.ToListAsync();
            var mediaCounts = await GetTagMediaCountsAsync(all.Select(t => t.Id));

            tags = all
                .OrderByDescending(t => mediaCounts.GetValueOrDefault(t.Id, 0))
                .ThenBy(t => t.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();
        }
        else
        {
            tags = await query
                .OrderBy(t => t.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();
        }

        return (tags, totalCount);
    }

    public async Task<Dictionary<int, int>> GetTagMediaCountsAsync(IEnumerable<int> tagIds)
    {
        var ids = tagIds as IList<int> ?? tagIds.ToList();
        if (ids.Count == 0) return [];

        // join medias：只统计真实存在的影片，残留的关联行不参与计数
        var counts = await (
                from mt in _context.MediaTags
                join m in _context.Medias on mt.MediaId equals m.Id
                where ids.Contains(mt.TagId)
                group mt by mt.TagId into g
                select new { TagId = g.Key, Count = g.Count() })
            .ToListAsync();

        return counts.ToDictionary(c => c.TagId, c => c.Count);
    }
}
