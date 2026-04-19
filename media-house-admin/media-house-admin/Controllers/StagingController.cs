using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data.Entities;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/staging")]
[Authorize]
public class StagingController(
    IStagingService stagingService,
    IPublishService publishService,
    IPluginExecutionService pluginExecutionService,
    ILogger<StagingController> logger) : ControllerBase
{
    private readonly IStagingService _stagingService = stagingService;
    private readonly IPublishService _publishService = publishService;
    private readonly IPluginExecutionService _pluginExecutionService = pluginExecutionService;
    private readonly ILogger<StagingController> _logger = logger;

    [HttpGet("list")]
    public async Task<ActionResult<List<StagingMediaDto>>> GetAllStagingMedias()
    {
        try
        {
            var result = await _stagingService.GetAllStagingMediasAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all staging medias");
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<StagingMediaDto>> GetStagingMedia(string id)
    {
        try
        {
            var result = await _stagingService.GetStagingMediaAsync(id);
            if (result == null)
            {
                return NotFound(new { error = "Staging media not found" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting staging media {StagingId}", id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/metadata")]
    public async Task<ActionResult<StagingMediaDto>> UpdateStagingMetadata(string id, [FromBody] UpdateStagingMetadataRequest request)
    {
        try
        {
            var result = await _stagingService.UpdateStagingMetadataAsync(id, request);
            if (result == null)
            {
                return NotFound(new { error = "Staging media not found" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating metadata for staging media {StagingId}", id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/poster")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10MB limit
    public async Task<ActionResult> UploadPoster(string id)
    {
        try
        {
            if (Request.Body == null)
            {
                return BadRequest(new { error = "No data provided" });
            }

            var fileName = Request.Headers["X-File-Name"].FirstOrDefault() ?? "poster.jpg";
            var result = await _stagingService.UploadPosterAsync(id, Request.Body, fileName);

            if (result == null)
            {
                return NotFound(new { error = "Staging media not found" });
            }

            return Ok(new { posterPath = result });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading poster for staging media {StagingId}", id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/fanart")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10MB limit
    public async Task<ActionResult> UploadFanart(string id)
    {
        try
        {
            if (Request.Body == null)
            {
                return BadRequest(new { error = "No data provided" });
            }

            var fileName = Request.Headers["X-File-Name"].FirstOrDefault() ?? "fanart.jpg";
            var result = await _stagingService.UploadFanartAsync(id, Request.Body, fileName);

            if (result == null)
            {
                return NotFound(new { error = "Staging media not found" });
            }

            return Ok(new { fanartPath = result });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading fanart for staging media {StagingId}", id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/screenshot")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10MB limit
    public async Task<ActionResult> UploadScreenshot(string id)
    {
        try
        {
            if (Request.Body == null)
            {
                return BadRequest(new { error = "No data provided" });
            }

            var fileName = Request.Headers["X-File-Name"].FirstOrDefault() ?? "screenshot.jpg";
            var result = await _stagingService.UploadScreenshotAsync(id, Request.Body, fileName);

            if (result == null)
            {
                return NotFound(new { error = "Staging media not found" });
            }

            return Ok(new { screenshotPath = result });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading screenshot for staging media {StagingId}", id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteStagingMedia(string id)
    {
        try
        {
            var success = await _stagingService.DeleteStagingMediaAsync(id);
            if (!success)
            {
                return NotFound(new { error = "Staging media not found" });
            }

            return Ok(new { message = "Staging media deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting staging media {StagingId}", id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/publish")]
    public async Task<ActionResult<PublishResponseDto>> Publish(string id, [FromBody] PublishRequest request)
    {
        try
        {
            var result = await _publishService.PublishAsync(id, request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error publishing staging media {StagingId}", id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id}/scrape-metadata")]
    public async Task<ActionResult<ScrapeMetadataResponseDto>> ScrapeMetadata(
        string id,
        [FromBody] ScrapeStagingRequest request)
    {
        try
        {
            // 获取 staging media
            var stagingMedia = await _stagingService.GetStagingMediaAsync(id);
            if (stagingMedia == null)
            {
                return NotFound(new { error = "Staging media not found" });
            }

            // 从 staging media id 生成 businessId（使用字符串哈希生成数字）
            var businessId = Math.Abs(id.GetHashCode());

            var videoDir = Path.GetDirectoryName(stagingMedia.VideoPath);
            if (string.IsNullOrEmpty(videoDir) || !Directory.Exists(videoDir))
            {
                return BadRequest(new { error = "Invalid video path or directory not exists" + $" ({stagingMedia.VideoPath})" });
            }

            var log = await _pluginExecutionService.ExecutePluginAsync(
                request.PluginKey,
                sourceDir: videoDir,
                outputDir: videoDir,
                pluginVersion: request.PluginVersion,
                configName: request.ConfigName,
                businessId: businessId,
                businessType: PluginBusinessType.Staging
            );

            var response = new ScrapeMetadataResponseDto
            {
                ExecutionId = log.Id,
                Status = log.Status,
                StagingMediaId = id
            };

            return Accepted(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error scraping metadata for staging media {StagingId}", id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{id}/image")]
    [AllowAnonymous]
    public async Task<IActionResult> GetStagingImage(string id, [FromQuery] string url_name)
    {
        try
        {
            if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(url_name))
            {
                return BadRequest(new { error = "Invalid id or url name" });
            }

            var imagePath = await _stagingService.GetActualImagePathAsync(id, url_name);

            if (string.IsNullOrEmpty(imagePath) || !System.IO.File.Exists(imagePath))
            {
                return NotFound(new { error = "Image not found" });
            }

            var fileInfo = new System.IO.FileInfo(imagePath);
            var contentType = GetContentType(fileInfo.Extension);
            var fileStream = new System.IO.FileStream(imagePath, System.IO.FileMode.Open, System.IO.FileAccess.Read);

            return File(fileStream, contentType, enableRangeProcessing: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error serving staging image for {StagingId}: {UrlName}", id, url_name);
            return StatusCode(500, new { error = "Failed to serve image" });
        }
    }

    private static string GetContentType(string extension)
    {
        return extension.ToLower() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "application/octet-stream"
        };
    }
}
