using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class LogService(MediaHouseLogDbContext context, ILogger<LogService> logger) : ILogService
{
    public async Task<PagedResponseDto<SystemLogDto>> GetLogsAsync(LogQueryDto query)
    {
        var dbQuery = context.SystemLogs.AsQueryable();

        // 按日志级别筛选
        if (!string.IsNullOrEmpty(query.Level))
        {
            var levels = query.Level.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim().ToLower())
                .ToList();
            dbQuery = dbQuery.Where(l => levels.Contains(l.Level.ToLower()));
        }

        // 按时间范围筛选
        if (query.StartTime.HasValue)
        {
            dbQuery = dbQuery.Where(l => l.Timestamp >= query.StartTime.Value);
        }
        if (query.EndTime.HasValue)
        {
            dbQuery = dbQuery.Where(l => l.Timestamp <= query.EndTime.Value);
        }

        // 只查询有异常的日志
        if (query.HasException == true)
        {
            dbQuery = dbQuery.Where(l => !string.IsNullOrEmpty(l.Exception));
        }

        // 总数
        var totalCount = await dbQuery.CountAsync();

        // 排序
        var isSortAsc = (query.SortOrder?.ToLower() ?? "desc") == "asc";
        var sortedQuery = isSortAsc
            ? dbQuery.OrderBy(l => l.Timestamp)
            : dbQuery.OrderByDescending(l => l.Timestamp);

        // 分页
        var items = await sortedQuery
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync();

        var dtos = items.Select(MapToDto).ToList();

        return new PagedResponseDto<SystemLogDto>
        {
            Items = dtos,
            TotalCount = totalCount,
            Page = query.Page,
            PageSize = query.PageSize
        };
    }

    public async Task<int> GetLogCountAsync(LogQueryDto query)
    {
        var dbQuery = context.SystemLogs.AsQueryable();

        // 应用与 GetLogsAsync 相同的筛选条件
        if (!string.IsNullOrEmpty(query.Level))
        {
            var levels = query.Level.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim().ToLower())
                .ToList();
            dbQuery = dbQuery.Where(l => levels.Contains(l.Level.ToLower()));
        }

        if (query.StartTime.HasValue)
        {
            dbQuery = dbQuery.Where(l => l.Timestamp >= query.StartTime.Value);
        }
        if (query.EndTime.HasValue)
        {
            dbQuery = dbQuery.Where(l => l.Timestamp <= query.EndTime.Value);
        }

        if (query.HasException == true)
        {
            dbQuery = dbQuery.Where(l => !string.IsNullOrEmpty(l.Exception));
        }

        return await dbQuery.CountAsync();
    }

    public async Task<bool> DeleteLogsAsync(DateTime beforeDate)
    {
        var logsToDelete = await context.SystemLogs
            .Where(l => l.Timestamp < beforeDate)
            .ToListAsync();

        context.SystemLogs.RemoveRange(logsToDelete);
        var result = await context.SaveChangesAsync() > 0;

        logger.LogInformation("Deleted {Count} logs before {BeforeDate}",
            logsToDelete.Count, beforeDate);

        return result;
    }

    public async Task<Dictionary<string, int>> GetLogLevelStatsAsync()
    {
        var stats = await context.SystemLogs
            .GroupBy(l => l.Level)
            .Select(g => new { Level = g.Key, Count = g.Count() })
            .ToListAsync();

        return stats.ToDictionary(s => s.Level, s => s.Count);
    }

    private static SystemLogDto MapToDto(SystemLog log)
    {
        return new SystemLogDto
        {
            Id = log.Id,
            Timestamp = log.Timestamp,
            Level = log.Level,
            Properties = log.Properties,
            Exception = log.Exception,
        };
    }
}
