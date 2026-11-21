using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class ActorService(MediaHouseDbContext context, ILogger<ActorService> logger) : IActorService
{
    private const int MaxPageSize = 500;

    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<ActorService> _logger = logger;

    public async Task<(List<Staff> Actors, int TotalCount)> GetActorsAsync(
        int page,
        int pageSize,
        string? sortBy = null,
        bool favoritedOnly = false,
        int? userId = null)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 20 : Math.Min(pageSize, MaxPageSize);

        // 只看收藏：按收藏时间倒序
        if (favoritedOnly)
        {
            if (!userId.HasValue || userId.Value <= 0) return ([], 0);

            var uid = userId.Value;
            var favoriteQuery =
                from s in _context.Staffs
                join f in _context.FavoriteStaffs.Where(x => x.UserId == uid) on s.Id equals f.StaffId
                where s.MediaStaffs.Any()
                orderby f.CreateTime descending, s.Id
                select s;

            var favoriteTotal = await favoriteQuery.CountAsync();
            var favoriteActors = await favoriteQuery
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return (favoriteActors, favoriteTotal);
        }

        // 只列出至少还挂着一条关联的人员
        var query = _context.Staffs.Where(s => s.MediaStaffs.Any());
        var totalCount = await query.CountAsync();

        List<Staff> actors;

        // 按作品数排序需要先聚合再排序，SQL 里没法直接分页
        if (sortBy?.ToLower() == "mediacount")
        {
            var all = await query.ToListAsync();
            var mediaCounts = await GetActorMediaCountsAsync(all.Select(a => a.Id));

            actors = all
                .OrderByDescending(a => mediaCounts.GetValueOrDefault(a.Id, 0))
                .ThenBy(a => a.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();
        }
        else
        {
            actors = await query
                .OrderBy(a => a.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();
        }

        return (actors, totalCount);
    }

    public async Task<Dictionary<int, int>> GetActorMediaCountsAsync(IEnumerable<int> actorIds)
    {
        var ids = actorIds as IList<int> ?? actorIds.ToList();
        if (ids.Count == 0) return [];

        // join medias：只统计真实存在的影片，残留的关联行不参与计数
        var counts = await (
                from ms in _context.MediaStaffs
                join m in _context.Medias on ms.MediaId equals m.Id
                where ids.Contains(ms.StaffId)
                group ms by ms.StaffId into g
                select new { StaffId = g.Key, Count = g.Count() })
            .ToListAsync();

        return counts.ToDictionary(c => c.StaffId, c => c.Count);
    }

    /// <summary>
    /// 切换演员收藏。返回 true=已收藏、false=已取消、null=演员不存在。
    /// </summary>
    public async Task<bool?> ToggleFavoriteAsync(int staffId, int userId)
    {
        if (!await _context.Staffs.AnyAsync(s => s.Id == staffId))
        {
            return null;
        }

        var existing = await _context.FavoriteStaffs
            .FirstOrDefaultAsync(f => f.UserId == userId && f.StaffId == staffId);

        if (existing != null)
        {
            _context.FavoriteStaffs.Remove(existing);
            await _context.SaveChangesAsync();
            return false;
        }

        _context.FavoriteStaffs.Add(new FavoriteStaff
        {
            UserId = userId,
            StaffId = staffId,
            CreateTime = DateTime.UtcNow,
        });
        await _context.SaveChangesAsync();

        _logger.LogInformation("User {UserId} favorited staff {StaffId}", userId, staffId);
        return true;
    }

    public async Task<HashSet<int>> GetFavoritedStaffIdsAsync(int userId, IEnumerable<int> staffIds)
    {
        var ids = staffIds as IList<int> ?? staffIds.ToList();
        if (ids.Count == 0 || userId <= 0) return [];

        var favorited = await _context.FavoriteStaffs
            .Where(f => f.UserId == userId && ids.Contains(f.StaffId))
            .Select(f => f.StaffId)
            .ToListAsync();

        return [.. favorited];
    }
}
