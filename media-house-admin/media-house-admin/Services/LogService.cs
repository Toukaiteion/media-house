using MediaHouse.Config;
using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;
using Serilog.Events;
using System.Text.Json;

namespace MediaHouse.Services;

public class LogService(MediaHouseLogDbContext context, ILogger<LogService> logger, LoggingLevelSwitchConfig levelSwitchConfig) : ILogService
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

        // 按消息内容筛选（模糊匹配）
        if (!string.IsNullOrEmpty(query.Message))
        {
            dbQuery = dbQuery.Where(l => l.RenderedMessage != null && l.RenderedMessage.Contains(query.Message));
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

        // 按 ID 范围筛选
        if (query.FromId.HasValue)
        {
            dbQuery = dbQuery.Where(l => l.Id > query.FromId.Value);
        }
        if (query.ToId.HasValue)
        {
            dbQuery = dbQuery.Where(l => l.Id < query.ToId.Value);
        }

        // 总数
        var totalCount = await dbQuery.CountAsync();

        // 排序
        var sortBy = query.SortBy?.ToLower() ?? "timestamp";
        var isSortAsc = (query.SortOrder?.ToLower() ?? "desc") == "asc";

        IQueryable<SystemLog> sortedQuery = sortBy switch
        {
            "id" => isSortAsc
                ? dbQuery.OrderBy(l => l.Id)
                : dbQuery.OrderByDescending(l => l.Id),
            "timestamp" or _ => isSortAsc
                ? dbQuery.OrderBy(l => l.Timestamp)
                : dbQuery.OrderByDescending(l => l.Timestamp)
        };

        // 分页或 Limit 查询
        var items = await sortedQuery.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync();

        // 映射到 DTO
        var dtos = items.Select(MapToDto).ToList();

        // 对 Category (SourceContext) 和 MachineName 进行内存级筛选
        // 因为这些字段存储在 Properties JSON 中，SQLite 不支持原生 JSON 查询
        if (!string.IsNullOrEmpty(query.Category))
        {
            dtos = [.. dtos.Where(l =>
                l.SourceContext != null && l.SourceContext.Contains(query.Category, StringComparison.OrdinalIgnoreCase)
            )];
        }

        if (!string.IsNullOrEmpty(query.MachineName))
        {
            dtos = [.. dtos.Where(l =>
                l.MachineName != null && l.MachineName.Equals(query.MachineName, StringComparison.OrdinalIgnoreCase)
            )];
        }

        // 重新计算总数（考虑内存级筛选）
        totalCount = dtos.Count;

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

        // 应用与 GetLogsAsync 相相的筛选条件
        if (!string.IsNullOrEmpty(query.Level))
        {
            var levels = query.Level.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim().ToLower())
                .ToList();
            dbQuery = dbQuery.Where(l => levels.Contains(l.Level.ToLower()));
        }

        if (!string.IsNullOrEmpty(query.Message))
        {
            dbQuery = dbQuery.Where(l => l.RenderedMessage != null && l.RenderedMessage.Contains(query.Message));
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

        // 按 ID 范围筛选
        if (query.FromId.HasValue)
        {
            dbQuery = dbQuery.Where(l => l.Id > query.FromId.Value);
        }
        if (query.ToId.HasValue)
        {
            dbQuery = dbQuery.Where(l => l.Id < query.ToId.Value);
        }

        var items = await dbQuery.ToListAsync();
        var dtos = items.Select(MapToDto).ToList();

        // 对 Category (SourceContext) 和 MachineName 进行内存级筛选
        if (!string.IsNullOrEmpty(query.Category))
        {
            dtos = dtos.Where(l =>
                l.SourceContext != null && l.SourceContext.Contains(query.Category, StringComparison.OrdinalIgnoreCase)
            ).ToList();
        }

        if (!string.IsNullOrEmpty(query.MachineName))
        {
            dtos = dtos.Where(l =>
                l.MachineName != null && l.MachineName.Equals(query.MachineName, StringComparison.OrdinalIgnoreCase)
            ).ToList();
        }

        return dtos.Count;
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

    public Task<Dictionary<string, string>> GetMinimumLevelsAsync()
    {
        return Task.FromResult(new Dictionary<string, string>
        {
            { "Default", levelSwitchConfig.LevelSwitch.MinimumLevel.ToString() }
        });
    }

    public Task<bool> SetMinimumLevelAsync(string level)
    {
        if (Enum.TryParse<LogEventLevel>(level, true, out var logLevel))
        {
            levelSwitchConfig.LevelSwitch.MinimumLevel = logLevel;
            logger.LogInformation("Log level changed to {Level}", level);
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    private static SystemLogDto MapToDto(SystemLog log)
    {
        var dto = new SystemLogDto
        {
            Id = log.Id,
            Timestamp = log.Timestamp,
            Message = log.RenderedMessage,
            Level = log.Level,
            Exception = log.Exception,
        };

        // 解析 Properties JSON 字符串
        if (!string.IsNullOrEmpty(log.Properties))
        {
            try
            {
                using var document = JsonDocument.Parse(log.Properties);
                var root = document.RootElement;

                // 提取 KeyId
                if (root.TryGetProperty("KeyId", out var keyIdElement))
                {
                    dto.KeyId = keyIdElement.GetString();
                }

                // 提取 EventId (嵌套对象)
                if (root.TryGetProperty("EventId", out var eventIdElement))
                {
                    dto.EventId = new EventIdDto
                    {
                        Id = eventIdElement.TryGetProperty("Id", out var idElement) ? idElement.GetInt32() : 0,
                        Name = eventIdElement.TryGetProperty("Name", out var nameElement) ? nameElement.GetString() ?? string.Empty : string.Empty
                    };
                }

                // 提取 SourceContext
                if (root.TryGetProperty("SourceContext", out var sourceContextElement))
                {
                    dto.SourceContext = sourceContextElement.GetString();
                }

                // 提取 MachineName
                if (root.TryGetProperty("MachineName", out var machineNameElement))
                {
                    dto.MachineName = machineNameElement.GetString();
                }

                // 提取 ThreadId
                if (root.TryGetProperty("ThreadId", out var threadIdElement))
                {
                    dto.ThreadId = threadIdElement.TryGetInt32(out var threadId) ? threadId : null;
                }

                // 提取 Application
                if (root.TryGetProperty("Application", out var applicationElement))
                {
                    dto.Application = applicationElement.GetString();
                }
            }
            catch (JsonException)
            {
                // JSON 解析失败时跳过，保持默认值
            }
        }

        return dto;
    }
}
