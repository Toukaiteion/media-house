using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface ILogService
{
    Task<PagedResponseDto<SystemLogDto>> GetLogsAsync(LogQueryDto query);
    Task<int> GetLogCountAsync(LogQueryDto query);
    Task<List<string>> GetCategoriesAsync();
    Task<bool> DeleteLogsAsync(DateTime beforeDate);
    Task<Dictionary<string, int>> GetLogLevelStatsAsync();
}
