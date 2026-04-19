using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class LogService(MediaHouseDbContext context, ILogger<LogService> logger) : ILogService
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

        // 按分类（SourceContext）筛选
        if (!string.IsNullOrEmpty(query.Category))
        {
            dbQuery = dbQuery.Where(l =>
                (l.SourceContext != null && l.SourceContext.Contains(query.Category)) ||
                (l.Properties != null && l.Properties.Contains(query.Category)));
        }

        // 按消息搜索
        if (!string.IsNullOrEmpty(query.Message))
        {
            dbQuery = dbQuery.Where(l => l.Message.Contains(query.Message));
        }

        // 按机器名筛选
        if (!string.IsNullOrEmpty(query.MachineName))
        {
            dbQuery = dbQuery.Where(l => l.MachineName == query.MachineName);
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

        if (!string.IsNullOrEmpty(query.Category))
        {
            dbQuery = dbQuery.Where(l =>
                (l.SourceContext != null && l.SourceContext.Contains(query.Category)) ||
                (l.Properties != null && l.Properties.Contains(query.Category)));
        }

        if (!string.IsNullOrEmpty(query.Message))
        {
            dbQuery = dbQuery.Where(l => l.Message.Contains(query.Message));
        }

        if (!string.IsNullOrEmpty(query.MachineName))
        {
            dbQuery = dbQuery.Where(l => l.MachineName == query.MachineName);
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

    public async Task<List<string>> GetCategoriesAsync()
    {
        return await context.SystemLogs
            .Where(l => !string.IsNullOrEmpty(l.SourceContext))
            .Select(l => l.SourceContext!)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();
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
            Message = log.Message,
            MessageTemplate = log.MessageTemplate,
            Level = log.Level,
            Properties = log.Properties,
            Exception = log.Exception,
            SourceContext = log.SourceContext,
            MachineName = log.MachineName,
            ThreadId = log.ThreadId,
            Application = log.Application
        };
    }
}
