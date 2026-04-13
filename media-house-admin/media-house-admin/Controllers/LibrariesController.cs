using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.DTOs;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class LibrariesController(
    ILibraryService libraryService,
    IScanService scanService,
    ILogger<LibrariesController> logger) : ControllerBase
{
    private readonly ILibraryService _libraryService = libraryService;
    private readonly IScanService _scanService = scanService;
    private readonly ILogger<LibrariesController> _logger = logger;

    [HttpGet]
    public async Task<ActionResult<List<MediaLibraryDto>>> GetLibraries()
    {
        try
        {
            var libraries = await _libraryService.GetAllLibrariesAsync();
            var dtos = libraries.Select(MapToDto).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching libraries");
            return StatusCode(500, new { error = "Failed to fetch libraries" });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MediaLibraryDto>> GetLibrary(int id)
    {
        try
        {
            var library = await _libraryService.GetLibraryByIdAsync(id);
            if (library == null)
            {
                return NotFound(new { error = "Library not found" });
            }
            return Ok(MapToDto(library));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching library {LibraryId}", id);
            return StatusCode(500, new { error = "Failed to fetch library" });
        }
    }

    [HttpPost]
    public async Task<ActionResult<MediaLibraryDto>> CreateLibrary([FromBody] CreateMediaLibraryDto dto)
    {
        try
        {
            if (!Enum.TryParse<LibraryType>(dto.Type, true, out var libraryType))
            {
                return BadRequest(new { error = "Invalid library type" });
            }

            var library = await _libraryService.CreateLibraryAsync(dto.Name, libraryType, dto.Path);
            return CreatedAtAction(nameof(GetLibrary), new { id = library.Id }, MapToDto(library));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating library");
            return StatusCode(500, new { error = "Failed to create library" });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<MediaLibraryDto>> UpdateLibrary(int id, [FromBody] UpdateMediaLibraryDto dto)
    {
        try
        {
            var library = await _libraryService.UpdateLibraryAsync(id, dto.Name, dto.Path, dto.IsEnabled);
            if (library == null)
            {
                return NotFound(new { error = "Library not found" });
            }
            return Ok(MapToDto(library));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating library {LibraryId}", id);
            return StatusCode(500, new { error = "Failed to update library" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteLibrary(int id)
    {
        try
        {
            var success = await _libraryService.DeleteLibraryAsync(id);
            if (!success)
            {
                return NotFound(new { error = "Library not found" });
            }
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting library {LibraryId}", id);
            return StatusCode(500, new { error = "Failed to delete library" });
        }
    }

    [HttpPost("{id}/scan")]
    public async Task<ActionResult> TriggerScan(int id, [FromQuery] string scanType = "full")
    {
        try
        {
            var library = await _libraryService.GetLibraryByIdAsync(id);
            if (library == null)
            {
                return NotFound(new { error = "Library not found" });
            }

            if (scanType.Equals("full", StringComparison.CurrentCultureIgnoreCase))
            {
                await _scanService.StartFullScanAsync(id);
            }
            else
            {
                await _scanService.StartIncrementalScanAsync(id);
            }

            return Ok(new { message = "Scan started" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error triggering scan for library {LibraryId}", id);
            return StatusCode(500, new { error = "Failed to trigger scan" });
        }
    }

    [HttpGet("{id}/scan-logs")]
    public async Task<ActionResult<List<ScanLogDto>>> GetScanLogs(int id, [FromQuery] int limit = 10)
    {
        try
        {
            var logs = await _scanService.GetScanLogsAsync(id, limit);
            var dtos = logs.Select(log => new ScanLogDto
            {
                Id = log.Id,
                MediaLibraryId = log.MediaLibraryId,
                SyncType = log.SyncType.ToString(),
                Status = log.Status.ToString(),
                AddedCount = log.AddedCount ?? 0,
                UpdatedCount = log.UpdatedCount ?? 0,
                DeletedCount = log.DeletedCount ?? 0,
                StartTime = log.StartTime,
                EndTime = log.EndTime,
                ErrorMessage = log.ErrorMessage
            }).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching scan logs for library {LibraryId}", id);
            return StatusCode(500, new { error = "Failed to fetch scan logs" });
        }
    }

    private static MediaLibraryDto MapToDto(MediaLibrary library)
    {
        return new MediaLibraryDto
        {
            Id = library.Id,
            Name = library.Name,
            Type = library.Type.ToString(),
            Path = library.Path,
            Status = library.Status.ToString() ?? "Unknown",
            CreatedAt = library.CreateTime,
            UpdatedAt = library.UpdateTime,
            IsEnabled = library.IsEnabled
        };
    }
}
