using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/logs")]
[Authorize]
public class LogsController(ILogService logService) : ControllerBase
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
        catch (Exception)
        {
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
        catch (Exception)
        {
            return StatusCode(500, new { error = "Failed to fetch log stats" });
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
        catch (Exception)
        {
            return StatusCode(500, new { error = "Failed to delete logs" });
        }
    }

    /// <summary>
    /// 获取当前日志级别配置
    /// </summary>
    [HttpGet("levels")]
    public async Task<ActionResult<Dictionary<string, string>>> GetLevels()
    {
        try
        {
            var levels = await logService.GetMinimumLevelsAsync();
            return Ok(levels);
        }
        catch (Exception)
        {
            return StatusCode(500, new { error = "Failed to fetch log levels" });
        }
    }

    /// <summary>
    /// 设置默认日志级别
    /// </summary>
    [HttpPut("level")]
    public async Task<ActionResult> SetLevel([FromBody] SetLogLevelDto dto)
    {
        try
        {
            var success = await logService.SetMinimumLevelAsync(dto.Level);
            if (!success)
                return BadRequest(new { error = $"Invalid log level: {dto.Level}. Valid levels: Verbose, Debug, Information, Warning, Error, Fatal" });
            return Ok(new { message = $"Log level set to {dto.Level}" });
        }
        catch (Exception)
        {
            return StatusCode(500, new { error = "Failed to set log level" });
        }
    }
}

public class SetLogLevelDto
{
    public string Level { get; set; } = string.Empty;
}
