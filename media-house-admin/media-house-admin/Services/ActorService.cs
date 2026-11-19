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

    public async Task<(List<Staff> Actors, int TotalCount)> GetActorsAsync(int page, int pageSize, string? sortBy = null)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 20 : Math.Min(pageSize, MaxPageSize);

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
}
