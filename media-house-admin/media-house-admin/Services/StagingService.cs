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

        media.Title = request.Title;
        media.OriginalTitle = request.OriginalTitle;
        media.Year = request.Year;
        media.Studio = request.Studio;
        media.Runtime = request.Runtime;
        media.Description = request.Description;
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

        var urlName = MediaUtils.GenerateUrlNameFromPath(destFile);
        media.ScreenshotsPath = string.IsNullOrEmpty(media.ScreenshotsPath)
            ? urlName
            : media.ScreenshotsPath + "," + urlName;

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

    private static string SanitizeDirectoryName(string name)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        return string.Join("_", name.Split(invalidChars));
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
            PosterPath = media.PosterPath,
            FanartPath = media.FanartPath,
            ScreenshotsPath = media.ScreenshotsPath,
            Tags = tags,
            Staff = staff,
            Status = media.Status,
            CreatedAt = media.CreatedAt,
            UpdatedAt = media.UpdatedAt,
            PublishedAt = media.PublishedAt
        };
    }
}
