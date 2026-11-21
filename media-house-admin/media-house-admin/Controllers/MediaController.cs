using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Net.Http.Headers;
using MediaHouse.Data;
using MediaHouse.DTOs;
using MediaHouse.Extensions;
using MediaHouse.Interfaces;
using MediaHouse.Data.Entities;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/media")]
[Authorize]
public class MediaController(
    MediaHouseDbContext dbContext,
    IMediaService mediaService,
    IFavorService favorService,
    IPlayRecordService playRecordService,
    IPluginExecutionService pluginExecutionService,
    IMetadataUpdateService metadataUpdateService,
    IMemoryCache cache,
    ILogger<MediaController> logger) : ControllerBase
{
    private readonly MediaHouseDbContext _dbContext = dbContext;
    private readonly IMediaService _mediaService = mediaService;
    private readonly IFavorService _favorService = favorService;
    private readonly IPlayRecordService _playRecordService = playRecordService;
    private readonly IPluginExecutionService _pluginExecutionService = pluginExecutionService;
    private readonly IMetadataUpdateService _metadataUpdateService = metadataUpdateService;
    private readonly IMemoryCache _cache = cache;
    private readonly ILogger<MediaController> _logger = logger;

    /// <summary>流媒体文件信息缓存项，避免每个 range 请求都查一次库</summary>
    private sealed record MediaStreamInfo(
        string Path,
        string ContentType,
        DateTimeOffset LastModified,
        EntityTagHeaderValue ETag);

    [HttpGet("file")]
    [AllowAnonymous]
    public IActionResult GetMediaFile([FromQuery] string path)
    {
        try
        {
            if (string.IsNullOrEmpty(path) || !System.IO.File.Exists(path))
            {
                return NotFound(new { error = "File not found" });
            }

            var fileInfo = new System.IO.FileInfo(path);
            var contentType = GetContentType(fileInfo.Extension);

            var fileStream = new System.IO.FileStream(path, System.IO.FileMode.Open, System.IO.FileAccess.Read);
            return File(fileStream, contentType, enableRangeProcessing: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error serving media file: {Path}", path);
            return StatusCode(500, new { error = "Failed to serve media file" });
        }
    }

    [HttpPut("{id}/metadata")]
    public async Task<ActionResult> UpdateMetadata(int id, [FromBody] UpdateMediaMetadataDto dto)
    {
        // Parameter validation
        if (id <= 0)
        {
            return BadRequest(new { error = "Invalid media ID" });
        }

        if (dto == null)
        {
            return BadRequest(new { error = "Invalid request body" });
        }

        // Call service layer for business logic
        var success = await _mediaService.UpdateMediaMetadataAsync(id, dto);

        if (!success)
        {
            return NotFound(new { error = "Media not found" });
        }

        return Ok(new { message = "Metadata updated successfully" });
    }

    [HttpGet("image/{url_name}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetImageByUrlName(string url_name)
    {
        try
        {
            // Parameter validation
            if (string.IsNullOrEmpty(url_name))
            {
                return BadRequest(new { error = "Invalid url name" });
            }

            // 列表页一屏就是几十张图，每张都查一次库太浪费，缓存 url_name -> 路径
            var cacheKey = $"media-img:{url_name}";
            if (!_cache.TryGetValue(cacheKey, out string? imagePath) || string.IsNullOrEmpty(imagePath))
            {
                imagePath = await _dbContext.MediaImgs
                    .AsNoTracking()
                    .Where(mi => mi.UrlName == url_name)
                    .Select(mi => mi.Path)
                    .FirstOrDefaultAsync();

                if (string.IsNullOrEmpty(imagePath))
                {
                    return NotFound(new { error = "Image not found" });
                }

                _cache.Set(cacheKey, imagePath, TimeSpan.FromMinutes(30));
            }

            if (!System.IO.File.Exists(imagePath))
            {
                _cache.Remove(cacheKey);
                return NotFound(new { error = "Image file not found" });
            }

            var fileInfo = new System.IO.FileInfo(imagePath);
            var etag = new EntityTagHeaderValue($"\"{fileInfo.Length:x}-{fileInfo.LastWriteTimeUtc.Ticks:x}\"");

            // 图片 30 天强缓存
            Response.Headers.CacheControl = "public, max-age=2592000";

            // 浏览器带着同一个 ETag 回来时直接 304，不传内容也不占带宽
            var ifNoneMatch = Request.Headers.IfNoneMatch.ToString();
            if (!string.IsNullOrEmpty(ifNoneMatch) && ifNoneMatch.Contains(etag.Tag.ToString()))
            {
                return StatusCode(StatusCodes.Status304NotModified);
            }

            // 用真实扩展名：原来用的是 mediaImgs.Extension（不带点，如 "jpg"），
            // 匹配不到 ContentType 的 switch，所有图片都退化成了 application/octet-stream
            return PhysicalFile(
                imagePath,
                GetContentType(fileInfo.Extension),
                fileInfo.LastWriteTimeUtc,
                etag,
                enableRangeProcessing: false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error serving image: {UrlName}", url_name);
            return StatusCode(500, new { error = "Failed to serve image" });
        }
    }

    [HttpGet("{mediaId}/stream")]
    [AllowAnonymous]
    public async Task<IActionResult> Play(int mediaId)
    {
        try
        {
            // Parameter validation
            if (mediaId <= 0)
            {
                return BadRequest(new { error = "Invalid media ID" });
            }

            // 一次观看会产生多个请求（首帧 + 每次拖动 seek），文件路径查一次就缓存住，
            // 之后所有 range 请求都是零数据库查询
            var cacheKey = $"media-stream:{mediaId}";
            if (!_cache.TryGetValue(cacheKey, out MediaStreamInfo? info) || info == null)
            {
                var filePath = await _dbContext.Medias
                    .AsNoTracking()
                    .Where(m => m.Id == mediaId)
                    .Select(m => m.MediaFiles
                        .OrderBy(f => f.Id)
                        .Select(f => f.Path)
                        .FirstOrDefault())
                    .FirstOrDefaultAsync();

                if (string.IsNullOrEmpty(filePath))
                {
                    return NotFound(new { error = "Media file not found" });
                }

                var fileInfo = new System.IO.FileInfo(filePath);
                info = new MediaStreamInfo(
                    filePath,
                    GetContentType(fileInfo.Extension),
                    fileInfo.LastWriteTimeUtc,
                    new EntityTagHeaderValue($"\"{fileInfo.Length:x}-{fileInfo.LastWriteTimeUtc.Ticks:x}\""));

                _cache.Set(cacheKey, info, TimeSpan.FromMinutes(10));
            }

            if (!System.IO.File.Exists(info.Path))
            {
                _cache.Remove(cacheKey);
                return NotFound(new { error = "Media file not found" });
            }

            // PhysicalFileResult 走 sendfile(2)：文件数据由内核直接送到 socket，
            // 不再经过托管内存的「读 64KB → 写 64KB」循环
            return PhysicalFile(
                info.Path,
                info.ContentType,
                info.LastModified,
                info.ETag,
                enableRangeProcessing: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error playing media {MediaId}", mediaId);
            return StatusCode(500, new { error = "Failed to play media" });
        }
    }

    [HttpPost("{mediaId}/favor")]
    public async Task<ActionResult> ToggleFavorite(int mediaId)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var isFavorited = await _favorService.ToggleFavoriteAsync(mediaId, userId.Value);

            return Ok(new
            {
                IsFavorited = isFavorited,
                Message = isFavorited ? "Added to favorites" : "Removed from favorites"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling favorite for media {MediaId}", mediaId);
            return StatusCode(500, new { error = "Failed to toggle favorite" });
        }
    }

    [HttpPost("{mediaId}/scan")]
    public async Task<ActionResult> ScanMedia(int mediaId)
    {
        try
        {
            // 1. 获取媒体及其库信息
            var media = await _dbContext.Medias
                .Include(m => m.Library)
                    .ThenInclude(l => l!.Plugin)
                .Include(m => m.Library!)
                    .ThenInclude(l => l!.PluginConfig)
                .Include(m => m.MediaFiles)
                .FirstOrDefaultAsync(m => m.Id == mediaId);

            if (media == null || media.Library == null)
            {
                return NotFound(new { error = "Media or library not found" });
            }

            // 2. 检查库是否配置了插件
            if (media.Library.Plugin == null)
            {
                return BadRequest(new { error = "Library has no plugin configured" });
            }

            // 3. 获取视频文件路径和源目录
            if (!media.MediaFiles.Any())
            {
                return BadRequest(new { error = "Media has no video files" });
            }

            var videoPath = media.MediaFiles.First().Path;
            var sourceDir = System.IO.Path.GetDirectoryName(videoPath) ?? videoPath;

            if (!System.IO.Directory.Exists(sourceDir))
            {
                return NotFound(new { error = "Source directory not found" });
            }

            // 4. 创建临时输出目录
            var outputDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"media_scan_{Guid.NewGuid()}");
            System.IO.Directory.CreateDirectory(outputDir);

            try
            {
                // 5. 调用插件执行服务
                var log = await _pluginExecutionService.ExecutePluginAsync(
                    media.Library.Plugin.PluginKey,
                    sourceDir,
                    outputDir: outputDir,
                    pluginVersion: media.Library.Plugin.Version,
                    configName: media.Library.PluginConfig?.ConfigName,
                    businessId: media.Id,
                    businessType: PluginBusinessType.Media
                );

                return Accepted(new { ExecutionId = log.Id, Status = log.Status });
            }
            catch
            {
                // 清理临时目录
                if (System.IO.Directory.Exists(outputDir))
                {
                    try
                    {
                        System.IO.Directory.Delete(outputDir, true);
                    }
                    catch (Exception cleanupEx)
                    {
                        _logger.LogWarning(cleanupEx, "Failed to cleanup output directory: {OutputDir}", outputDir);
                    }
                }
                throw;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error scanning media {MediaId}", mediaId);
            return StatusCode(500, new { error = "Failed to scan media" });
        }
    }

    [HttpPost("{mediaId}/update-metadata")]
    [RequestSizeLimit(50 * 1024 * 1024)] // 50MB limit
    public async Task<ActionResult> UpdateMetadataFromArchive(int mediaId, [FromForm] IFormFile file)
    {
        var result = await _metadataUpdateService.UpdateMetadataFromArchiveAsync(mediaId, file);

        if (!result.Success)
        {
            if (result.ErrorMessage == "Media not found")
            {
                return NotFound(new { error = result.ErrorMessage });
            }
            return BadRequest(new { error = result.ErrorMessage });
        }

        return Ok(new
        {
            message = "Metadata updated successfully",
            mediaId = result.MediaId,
            title = result.Title
        });
    }

    private static string GetContentType(string extension)
    {
        return extension.ToLower() switch
        {
            ".mp4" => "video/mp4",
            ".mkv" => "video/x-matroska",
            ".avi" => "video/x-msvideo",
            ".mov" => "video/quicktime",
            ".webm" => "video/webm",
            ".flv" => "video/x-flv",
            ".wmv" => "video/x-ms-wmv",
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".flac" => "audio/flac",
            ".ogg" => "audio/ogg",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".vtt" => "text/vtt",
            ".srt" => "text/srt",
            _ => "application/octet-stream"
        };
    }
}
