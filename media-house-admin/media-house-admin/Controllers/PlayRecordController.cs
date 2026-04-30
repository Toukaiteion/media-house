using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Extensions;
using MediaHouse.Interfaces;
using MediaHouse.Data.Entities;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/playrecord")]
[Authorize]
public class PlayRecordController : ControllerBase
{
    private readonly IPlayRecordService _playRecordService;
    private readonly ILogger<PlayRecordController> _logger;

    public PlayRecordController(
        IPlayRecordService playRecordService,
        ILogger<PlayRecordController> logger)
    {
        _playRecordService = playRecordService;
        _logger = logger;
    }

    [HttpGet("{mediaId}")]
    public async Task<ActionResult<PlayRecordDto>> GetPlayRecord(int mediaId)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var playRecord = await _playRecordService.GetPlayRecordAsync(mediaId, userId.Value);
            if (playRecord == null)
            {
                return NotFound(new { error = "Play record not found" });
            }

            return Ok(MapToDto(playRecord));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting play record for media {MediaId}", mediaId);
            return StatusCode(500, new { error = "Failed to get play record" });
        }
    }

    [HttpPost("{mediaId}")]
    public async Task<ActionResult<PlayRecordDto>> CreateOrUpdatePlayRecord(int mediaId, [FromBody] PlayRecordCreateDto dto)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var playRecord = await _playRecordService.CreateOrUpdatePlayRecordAsync(mediaId, userId.Value, dto.PositionSeconds);
            return Ok(MapToDto(playRecord));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating play record for media {MediaId}", mediaId);
            return StatusCode(500, new { error = "Failed to create play record" });
        }
    }

    [HttpPost("progress")]
    public async Task<ActionResult> UpdatePlaybackProgress([FromBody] UpdatePlayRecordDto dto)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            await _playRecordService.UpdatePlaybackProgressAsync(userId.Value, dto.MediaLibraryId, dto.MediaId, dto.PositionSeconds);
            return Ok(new { message = "Progress updated" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating playback progress");
            return StatusCode(500, new { error = "Failed to update progress" });
        }
    }

    [HttpPut("progress/complete")]
    public async Task<ActionResult> MarkAsCompleted([FromBody] UpdatePlayRecordDto dto)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            await _playRecordService.MarkAsCompletedAsync(userId.Value, dto.MediaLibraryId, dto.MediaId);
            return Ok(new { message = "Playback marked as completed" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error marking playback as completed");
            return StatusCode(500, new { error = "Failed to mark as completed" });
        }
    }

    private static string GetMimeType(string mediaType)
    {
        return mediaType.ToLower() switch
        {
            "movie" or "episode" => "video/mp4",
            _ => "application/octet-stream"
        };
    }

    private static PlayRecordDto MapToDto(PlayRecord progress)
    {
        return new PlayRecordDto
        {
            Id = progress.Id,
            UserId = progress.UserId,
            MediaLibraryId = progress.LibraryId,
            MediaId = progress.MediaId,
            PositionMs = progress.PositionMs,
            IsFinished = progress.IsFinished,
            LastPlayTime = progress.LastPlayTime,
            CreatedAt = progress.CreateTime,
            UpdatedAt = progress.UpdateTime
        };
    }
}
