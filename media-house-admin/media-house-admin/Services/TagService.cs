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

    public async Task<(List<Tag> Tags, int TotalCount)> GetTagsAsync(
        int page,
        int pageSize,
        string? sortBy = null,
        bool favoritedOnly = false,
        int? userId = null)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 20 : Math.Min(pageSize, MaxPageSize);

        // 只看收藏：按收藏时间倒序（最近收藏的在前）
        if (favoritedOnly)
        {
            if (!userId.HasValue || userId.Value <= 0) return ([], 0);

            var uid = userId.Value;
            var favoriteQuery =
                from t in _context.Tags
                join f in _context.FavoriteTags.Where(x => x.UserId == uid) on t.Id equals f.TagId
                where t.MediaTags.Any()
                orderby f.CreateTime descending, t.Id
                select t;

            var favoriteTotal = await favoriteQuery.CountAsync();
            var favoriteTags = await favoriteQuery
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return (favoriteTags, favoriteTotal);
        }

        // 只列出至少还挂着一条关联的标签
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

    /// <summary>
    /// 切换标签收藏。返回 true=已收藏、false=已取消、null=标签不存在。
    /// </summary>
    public async Task<bool?> ToggleFavoriteAsync(int tagId, int userId)
    {
        if (!await _context.Tags.AnyAsync(t => t.Id == tagId))
        {
            return null;
        }

        var existing = await _context.FavoriteTags
            .FirstOrDefaultAsync(f => f.UserId == userId && f.TagId == tagId);

        if (existing != null)
        {
            _context.FavoriteTags.Remove(existing);
            await _context.SaveChangesAsync();
            return false;
        }

        _context.FavoriteTags.Add(new FavoriteTag
        {
            UserId = userId,
            TagId = tagId,
            CreateTime = DateTime.UtcNow,
        });
        await _context.SaveChangesAsync();

        _logger.LogInformation("User {UserId} favorited tag {TagId}", userId, tagId);
        return true;
    }

    public async Task<HashSet<int>> GetFavoritedTagIdsAsync(int userId, IEnumerable<int> tagIds)
    {
        var ids = tagIds as IList<int> ?? tagIds.ToList();
        if (ids.Count == 0 || userId <= 0) return [];

        var favorited = await _context.FavoriteTags
            .Where(f => f.UserId == userId && ids.Contains(f.TagId))
            .Select(f => f.TagId)
            .ToListAsync();

        return [.. favorited];
    }
}
