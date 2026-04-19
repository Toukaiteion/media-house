using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Text.Json;
using MediaHouse.Config;

namespace MediaHouse.Services;

public class StagingService(
    MediaHouseDbContext context,
    IOptions<UploadSettings> uploadSettings,
    ILogger<StagingService> logger) : IStagingService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _settings = uploadSettings.Value;
    private readonly ILogger<StagingService> _logger = logger;

    public async Task<StagingMediaDto> CreateStagingMediaAsync(string uploadTaskId, CompleteUploadRequest request)
    {
        var uploadTask = await _context.UploadTasks.FindAsync(uploadTaskId);
        if (uploadTask == null)
        {
            throw new InvalidOperationException($"Upload task not found: {uploadTaskId}");
        }

        var stagingId = Guid.NewGuid().ToString();
        var stagingDir = Path.Combine(_settings.StagingPath, stagingId);
        Directory.CreateDirectory(stagingDir);

        // 移动视频文件
        var uploadDir = Path.Combine(_settings.UploadPath, uploadTaskId);
        var sourceFile = Path.Combine(uploadDir, uploadTask.FileName);
        var mediaDir = Path.Combine(stagingDir, SanitizeDirectoryName(request.Title));
        Directory.CreateDirectory(mediaDir);

        var destFile = Path.Combine(mediaDir, uploadTask.FileName);
        File.Move(sourceFile, destFile);

        var stagingMedia = new StagingMedia
        {
            Id = stagingId,
            UploadTaskId = uploadTaskId,
            Type = request.Type,
            Title = request.Title,
            VideoPath = destFile,
            VideoSize = new FileInfo(destFile).Length,
            Status = 0, // 待编辑
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.StagingMedias.Add(stagingMedia);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created staging media {StagingId} from upload task {UploadTaskId}", stagingId, uploadTaskId);

        return MapToDto(stagingMedia);
    }

    public async Task<List<StagingMediaDto>> GetAllStagingMediasAsync()
    {
        var medias = await _context.StagingMedias.ToListAsync();
        return medias.Select(MapToDto).ToList();
    }

    public async Task<StagingMediaDto?> GetStagingMediaAsync(string id)
    {
        var media = await _context.StagingMedias.FindAsync(id);
        return media == null ? null : MapToDto(media);
    }

    public async Task<StagingMediaDto?> UpdateStagingMetadataAsync(string id, UpdateStagingMetadataRequest request)
    {
        var media = await _context.StagingMedias.FindAsync(id);
        if (media == null) return null;

        media.Code = request.Code;
        media.Title = request.Title;
        media.OriginalTitle = request.OriginalTitle;
        media.Year = request.Year;
        media.ReleaseDate = request.ReleaseDate;
        media.Studio = request.Studio;
        media.Runtime = request.Runtime;
        media.Description = request.Description;
        media.PosterPath = request.PosterPath;
        media.FanartPath = request.FanartPath;
        media.ThumbPath = request.ThumbPath;
        media.ScreenshotsPath = request.ExtraFanartPaths != null ? string.Join(",", request.ExtraFanartPaths) : null;
        media.Tags = request.Tags != null ? JsonSerializer.Serialize(request.Tags) : null;
        media.Staff = request.Staff != null ? JsonSerializer.Serialize(request.Staff) : null;
        media.Status = 1; // 待发布
        media.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated metadata for staging media {StagingId}", id);

        return MapToDto(media);
    }

    public async Task<string?> UploadPosterAsync(string id, Stream imageData, string fileName)
    {
        var media = await _context.StagingMedias.FindAsync(id);
        if (media == null) return null;

        var stagingDir = Path.Combine(_settings.StagingPath, id);
        var mediaDir = Path.GetDirectoryName(media.VideoPath) ?? stagingDir;
        var destFile = Path.Combine(mediaDir, "poster" + Path.GetExtension(fileName));

        using var fileStream = new FileStream(destFile, FileMode.Create, FileAccess.Write);
        await imageData.CopyToAsync(fileStream);

        media.PosterPath = destFile;
        media.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Uploaded poster for staging media {StagingId}", id);

        return destFile;
    }

    public async Task<string?> UploadFanartAsync(string id, Stream imageData, string fileName)
    {
        var media = await _context.StagingMedias.FindAsync(id);
        if (media == null) return null;

        var stagingDir = Path.Combine(_settings.StagingPath, id);
        var mediaDir = Path.GetDirectoryName(media.VideoPath) ?? stagingDir;
        var destFile = Path.Combine(mediaDir, "fanart" + Path.GetExtension(fileName));

        using var fileStream = new FileStream(destFile, FileMode.Create, FileAccess.Write);
        await imageData.CopyToAsync(fileStream);

        media.FanartPath = destFile;
        media.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Uploaded fanart for staging {StagingId}", id);

        return destFile;
    }

    public async Task<string?> UploadScreenshotAsync(string id, Stream imageData, string fileName)
    {
        var media = await _context.StagingMedias.FindAsync(id);
        if (media == null) return null;

        var stagingDir = Path.Combine(_settings.StagingPath, id);
        var mediaDir = Path.GetDirectoryName(media.VideoPath) ?? stagingDir;
        var extrafanartDir = Path.Combine(mediaDir, "extrafanart");
        Directory.CreateDirectory(extrafanartDir);

        var destFile = Path.Combine(extrafanartDir, fileName);
        using var fileStream = new FileStream(destFile, FileMode.Create, FileAccess.Write);
        await imageData.CopyToAsync(fileStream);

        media.ScreenshotsPath = string.IsNullOrEmpty(media.ScreenshotsPath)
            ? destFile
            : media.ScreenshotsPath + "," + destFile;

        media.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Uploaded screenshot for staging {StagingId}", id);

        return destFile;
    }

    public async Task<bool> DeleteStagingMediaAsync(string id)
    {
        var media = await _context.StagingMedias.FindAsync(id);
        if (media == null) return false;

        _context.StagingMedias.Remove(media);
        await _context.SaveChangesAsync();

        // 删除目录
        var stagingDir = Path.Combine(_settings.StagingPath, id);
        if (Directory.Exists(stagingDir))
        {
            Directory.Delete(stagingDir, true);
        }

        _logger.LogInformation("Deleted staging {StagingId}", id);
        return true;
    }

    /// <summary>
    /// 尝试从插件执行结果更新暂存媒体元数据
    /// </summary>
    /// <param name="businessBusinessId">业务 ID（StagingMediaId 的哈希值）</param>
    /// <param name="metadataOutput">插件输出的元数据 JSON</param>
    public async Task TryUpdateMetadataFromPluginExecutionAsync(int businessBusinessId, string metadataOutput, string? createdFile)
    {
        try
        {
            // 解析元数据
            var metadataDoc = JsonDocument.Parse(metadataOutput);
            var metadataRoot = metadataDoc.RootElement;

            // 查找对应的暂存媒体（通过 BusinessId 反向查找）
            var stagingMedias = await _context.StagingMedias.ToListAsync();
            var matchedMedia = stagingMedias.FirstOrDefault(sm => Math.Abs(sm.Id.GetHashCode()) == businessBusinessId);

            if (matchedMedia == null)
            {
                _logger.LogWarning("No staging media found for BusinessId {BusinessId}", businessBusinessId);
                return;
            }

            // 构建更新请求
            var request = new UpdateStagingMetadataRequest
            {
                Title = metadataRoot.TryGetProperty("title", out var title) ? title.GetString() ?? matchedMedia.Title : "UNKOWN", // 保持原标题，除非搜刮结果明确要求覆盖
                OriginalTitle = metadataRoot.TryGetProperty("originaltitle", out var originalTitle) ? originalTitle.GetString() : null,
                Code = metadataRoot.TryGetProperty("num", out var code) ? code.GetString() : title.GetString(), // 优先使用 num 字段作为 code，否则使用 title
                Year = metadataRoot.TryGetProperty("year", out var year) ? year.GetInt32() : null,
                ReleaseDate = metadataRoot.TryGetProperty("releasedate", out var releaseDate) ? releaseDate.GetString() : 
                    metadataRoot.TryGetProperty("premiere", out var premieredate) ? premieredate.GetString() : 
                    metadataRoot.TryGetProperty("release", out var date) ? date.GetString() : null,
                Studio = metadataRoot.TryGetProperty("studio", out var studio) ? studio.GetString() : null,
                Runtime = metadataRoot.TryGetProperty("runtime", out var runtime) ? runtime.GetInt32() : null,
                Description = metadataRoot.TryGetProperty("summary", out var summary) ? summary.GetString() : null
            };

            // 处理 Tags
            if (metadataRoot.TryGetProperty("tags", out var tagsElement) && tagsElement.ValueKind == JsonValueKind.Array)
            {
                var tags = new List<string>();
                foreach (var tag in tagsElement.EnumerateArray())
                {
                    tags.Add(tag.GetString() ?? string.Empty);
                }
                request.Tags = tags;
            }

            // 处理 Staff（从 actors 转换）
            if (metadataRoot.TryGetProperty("actors", out var actorsElement) && actorsElement.ValueKind == JsonValueKind.Array)
            {
                var staff = new List<StaffItemDto>();
                foreach (var actor in actorsElement.EnumerateArray())
                {
                    var actorName = actor.GetString();
                    if (!string.IsNullOrEmpty(actorName))
                    {
                        staff.Add(new StaffItemDto { Name = actorName, Type = "actor" });
                    }
                }
                request.Staff = staff;
            }

            var sourceDir = Path.GetDirectoryName(matchedMedia.VideoPath) ?? _settings.StagingPath;
            // 寻找媒体文件，poster,thumb,fanart，extrafanart 字段，尝试下载到暂存目录（如果 URL 可访问）
            if (!string.IsNullOrEmpty(createdFile))
            {
                var createdDoc = JsonDocument.Parse(createdFile);
                var createdRoot = createdDoc.RootElement;
                if (createdRoot.TryGetProperty("poster", out var posterElement) && posterElement.ValueKind == JsonValueKind.String)
                {
                    var posterName = posterElement.GetString();
                    var posterPath = Path.Combine(sourceDir, posterName ?? "poster.jpg");
                    if (File.Exists(posterPath) && !string.IsNullOrEmpty(posterName))
                    {
                        request.PosterPath = posterPath;
                    }
                }
                if (createdRoot.TryGetProperty("fanart", out var fanartElement) && fanartElement.ValueKind == JsonValueKind.String)
                {
                    var fanartName = fanartElement.GetString();
                    var fanartPath = Path.Combine(sourceDir, fanartName ?? "fanart.jpg");
                    if (File.Exists(fanartPath) && !string.IsNullOrEmpty(fanartName))
                    {
                        request.FanartPath = fanartPath;
                    }
                }
                if (createdRoot.TryGetProperty("thumb", out var thumbElement) && thumbElement.ValueKind == JsonValueKind.String)
                {
                    var thumbName = thumbElement.GetString();
                    var thumbPath = Path.Combine(sourceDir, thumbName ?? "thumb.jpg");
                    if (File.Exists(thumbPath) && !string.IsNullOrEmpty(thumbName))
                    {
                        request.ThumbPath = thumbPath;
                    }
                }
                if (createdRoot.TryGetProperty("screenshots", out var extrafanartElement) && extrafanartElement.ValueKind == JsonValueKind.Array)
                {
                    var extrafanartPaths = new List<string>();
                    foreach (var item in extrafanartElement.EnumerateArray())
                    {
                        if (item.ValueKind == JsonValueKind.String)
                        {
                            var extraName = item.GetString();
                            var extraPath = Path.Combine(sourceDir, extraName ?? "extrafanart.jpg");
                            if (File.Exists(extraPath) && !string.IsNullOrEmpty(extraName))
                            {
                                extrafanartPaths.Add(extraPath);
                            }
                        }
                    }
                    if (extrafanartPaths.Count > 0)
                    {
                        request.ExtraFanartPaths = extrafanartPaths;
                    }
                }
            }
            

            // 更新元数据
            var updatedMedia = await UpdateStagingMetadataAsync(matchedMedia.Id, request);
            if (updatedMedia != null)
            {
                _logger.LogInformation("Successfully updated staging media {StagingId} metadata from plugin execution", matchedMedia.Id);
            }
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse metadata output for BusinessId {BusinessId}", businessBusinessId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update staging media metadata for BusinessId {BusinessId}", businessBusinessId);
        }
    }

    private static string SanitizeDirectoryName(string name)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        return string.Join("_", name.Split(invalidChars));
    }

    public async Task<string?> GetActualImagePathAsync(string id, string urlName)
    {
        var media = await _context.StagingMedias.FindAsync(id);
        if (media == null) return null;

        // 解密 url_name 得到实际路径
        var decryptedPath = CryptoHelper.Decrypt(urlName);
        if (string.IsNullOrEmpty(decryptedPath)) return null;

        // 验证路径是否属于该暂存媒体
        var stagingDir = Path.GetDirectoryName(media.VideoPath) ?? Path.Combine(_settings.StagingPath, id);
        if (!decryptedPath.StartsWith(stagingDir, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Invalid path: {Path} {mediaVideoPathj}", decryptedPath, media.VideoPath);
            return null;
        }

        if (!File.Exists(decryptedPath))
        {
            _logger.LogWarning("File not found: {Path}", decryptedPath);
            return null;
        }

        return decryptedPath;
    }

    private static StagingMediaDto MapToDto(StagingMedia media)
    {
        List<string>? tags = null;
        if (!string.IsNullOrEmpty(media.Tags))
        {
            try
            {
                tags = JsonSerializer.Deserialize<List<string>>(media.Tags);
            }
            catch
            {
                // Ignore parse errors
            }
        }

        List<StaffItemDto>? staff = null;
        if (!string.IsNullOrEmpty(media.Staff))
        {
            try
            {
                staff = JsonSerializer.Deserialize<List<StaffItemDto>>(media.Staff);
            }
            catch
            {
                // Ignore parse errors
            }
        }

        // 生成图片 URL（加密真实路径作为 url_name）
        var posterPath = string.IsNullOrEmpty(media.PosterPath) ? null : $"/api/staging/{media.Id}/image?url_name={CryptoHelper.Encrypt(media.PosterPath)}";
        var fanartPath = string.IsNullOrEmpty(media.FanartPath) ? null : $"/api/staging/{media.Id}/image?url_name={CryptoHelper.Encrypt(media.FanartPath)}";
        var thumbPath = string.IsNullOrEmpty(media.ThumbPath) ? null : $"/api/staging/{media.Id}/image?url_name={CryptoHelper.Encrypt(media.ThumbPath)}";
        List<string>? screenshots = null;
        if (!string.IsNullOrEmpty(media.ScreenshotsPath))
        {
            screenshots = media.ScreenshotsPath.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => $"/api/staging/{media.Id}/image?url_name={CryptoHelper.Encrypt(s)}")
                .ToList();
        }

        return new StagingMediaDto
        {
            Id = media.Id,
            UploadTaskId = media.UploadTaskId,
            Type = media.Type,
            Title = media.Title,
            OriginalTitle = media.OriginalTitle,
            Year = media.Year,
            Studio = media.Studio,
            Runtime = media.Runtime,
            Description = media.Description,
            VideoPath = media.VideoPath,
            VideoSize = media.VideoSize,
            PosterPath = posterPath,
            FanartPath = fanartPath,
            ThumbPath = thumbPath,
            Screenshots = screenshots,
            Tags = tags,
            Staff = staff,
            Status = media.Status,
            CreatedAt = media.CreatedAt,
            UpdatedAt = media.UpdatedAt,
            PublishedAt = media.PublishedAt
        };
    }


}
