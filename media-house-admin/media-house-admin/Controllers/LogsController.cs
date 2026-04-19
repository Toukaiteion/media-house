using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/logs")]
[Authorize]
public class LogsController(ILogService logService, ILogger<LogsController> logger) : ControllerBase
{
    /// <summary>
    /// 获取日志列表（分页）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResponseDto<SystemLogDto>>> GetLogs([FromQuery] LogQueryDto query)
    {
        try
        {
            var result = await logService.GetLogsAsync(query);
            return Ok(result);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error fetching logs");
            return StatusCode(500, new { error = "Failed to fetch logs" });
        }
    }

    /// <summary>
    /// 获取日志统计信息
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<Dictionary<string, int>>> GetStats()
    {
        try
        {
            var stats = await logService.GetLogLevelStatsAsync();
            return Ok(stats);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error fetching log stats");
            return StatusCode(500, new { error = "Failed to fetch log stats" });
        }
    }

    /// <summary>
    /// 获取所有日志分类（SourceContext）
    /// </summary>
    [HttpGet("categories")]
    public async Task<ActionResult<List<string>>> GetCategories()
    {
        try
        {
            var categories = await logService.GetCategoriesAsync();
            return Ok(categories);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error fetching log categories");
            return StatusCode(500, new { error = "Failed to fetch log categories" });
        }
    }

    /// <summary>
    /// 删除指定日期之前的日志
    /// </summary>
    [HttpDelete]
    public async Task<ActionResult> DeleteLogs([FromQuery] DateTime beforeDate)
    {
        try
        {
            var success = await logService.DeleteLogsAsync(beforeDate);
            if (!success)
                return BadRequest(new { error = "Failed to delete logs" });
            return Ok(new { message = $"Logs before {beforeDate} deleted" });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error deleting logs");
            return StatusCode(500, new { error = "Failed to delete logs" });
        }
    }
}
