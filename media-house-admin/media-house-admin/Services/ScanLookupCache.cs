using MediaHouse.Data;
using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

/// <summary>
/// 一次扫描内的标签 / 演员缓存。
///
/// 原来每部影片都要为每个标签、每个演员各查一次库（典型的 N+1），
/// 全量扫描几千部片会多出几万次查询。这里在扫描开始时一次性载入，
/// 之后全部走内存查找；只有扫描过程中首次出现的新标签 / 新演员才会写库。
/// </summary>
internal sealed class ScanLookupCache
{
    public Dictionary<string, Tag> Tags { get; } = new(StringComparer.Ordinal);

    public Dictionary<string, Staff> Staffs { get; } = new(StringComparer.Ordinal);

    public static async Task<ScanLookupCache> CreateAsync(MediaHouseDbContext context)
    {
        var cache = new ScanLookupCache();

        foreach (var tag in await context.Tags.ToListAsync())
        {
            cache.Tags[tag.TagName] = tag;
        }

        foreach (var staff in await context.Staffs.ToListAsync())
        {
            cache.Staffs[staff.Name] = staff;
        }

        return cache;
    }
}
