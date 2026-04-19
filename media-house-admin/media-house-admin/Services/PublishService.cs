using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using MediaHouse.Config;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace MediaHouse.Services;

public class PublishService(
    MediaHouseDbContext context,
    IOptions<UploadSettings> uploadSettings,
    ILogger<PublishService> logger) : IPublishService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _settings = uploadSettings.Value;
    private readonly ILogger<PublishService> _logger = logger;

    private class PublishPathMapping
    {
        // Original paths (before move)
        public string OriginalStagingDir { get; set; } = string.Empty;
        public string OriginalVideoPath { get; set; } = string.Empty;
        public string? OriginalPosterPath { get; set; }
        public string? OriginalFanartPath { get; set; }
        public string? OriginalThumbPath { get; set; }

        // New paths (after move)
        public string NewVideoPath { get; set; } = string.Empty;
        public string? NewPosterPath { get; set; }
        public string? NewFanartPath { get; set; }
        public string? NewThumbPath { get; set; }
        public List<string> NewScreenshotPaths { get; set; } = new();
        public List<string> NewOtherFilePaths { get; set; } = new();
    }

    private static string SanitizeDirectoryName(string name)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        return string.Join("_", name.Split(invalidChars));
    }

    public async Task<PublishResponseDto> PublishAsync(string stagingMediaId, PublishRequest request)
    {
        var stagingMedia = await _context.StagingMedias.FindAsync(stagingMediaId);
        if (stagingMedia == null)
        {
            throw new InvalidOperationException($"Staging media not found: {stagingMediaId}");
        }

        var library = await _context.MediaLibraries.FindAsync(request.LibraryId);
        if (library == null)
        {
            throw new InvalidOperationException($"Library not found: {request.LibraryId}");
        }

        var stagingDir = Path.Combine(_settings.StagingPath, stagingMediaId);

        try
        {
            // 阶段1：移动文件到库目录
            var pathMapping = await MoveFilesToLibraryAsync(stagingMedia, library);

            // 阶段2：数据库事务
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // 更新 StagingMedia 路径为新的库目录路径（在事务内）
                stagingMedia.VideoPath = pathMapping.NewVideoPath;
                stagingMedia.PosterPath = pathMapping.NewPosterPath;
                stagingMedia.FanartPath = pathMapping.NewFanartPath;
                stagingMedia.ThumbPath = pathMapping.NewThumbPath;

                var (mediaId, movieId) = await CreateMediaRecordsAsync(stagingMedia, library, request, pathMapping);

                // 更新 StagingMedia 状态
                stagingMedia.Status = 2; // 已发布
                stagingMedia.PublishedAt = DateTime.UtcNow;
                stagingMedia.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                await transaction.CommitAsync();

                // 阶段3：清理暂存目录
                CleanupStagingDirectory(stagingDir);

                _logger.LogInformation("Published staging {StagingId} to library {LibraryId} as media {MediaId}",
                    stagingMediaId, request.LibraryId, mediaId);

                return new PublishResponseDto
                {
                    MediaId = mediaId,
                    MovieId = movieId,
                    Status = "published"
                };
            }
            catch
            {
                await transaction.RollbackAsync();
                await RollbackFileMoveAsync(pathMapping, stagingMedia);
                throw;
            }
        }
        catch
        {
            // 文件移动失败，无需回滚
            throw;
        }
    }

    private async Task CreateMediaImgAsync(int mediaId, string filePath, string type)
    {
        var fileInfo = new FileInfo(filePath);
        var mediaImg = new MediaImgs
        {
            MediaId = mediaId,
            UrlName = MediaUtils.GenerateUrlNameFromPath(filePath),
            Name = Path.GetFileNameWithoutExtension(fileInfo.Name),
            Path = filePath,
            FileName = fileInfo.Name,
            Extension = fileInfo.Extension,
            Type = type,
            SizeBytes = fileInfo.Length,
            CreateTime = DateTime.UtcNow,
            UpdateTime = DateTime.UtcNow
        };

        _context.MediaImgs.Add(mediaImg);
        await _context.SaveChangesAsync();
    }

    private async Task CreateTagAsync(int libraryId, int mediaId, string mediaType, string tagName)
    {
        // 查找或创建 Tag
        var tag = await _context.Tags.FirstOrDefaultAsync(t => t.TagName == tagName);
        if (tag == null)
        {
            tag = new Tag { TagName = tagName };
            _context.Tags.Add(tag);
            await _context.SaveChangesAsync();
        }

        // 创建 MediaTag 关联
        var mediaTag = new MediaTag
        {
            MediaLibraryId = libraryId,
            MediaType = mediaType,
            MediaId = mediaId,
            TagId = tag.Id,
            CreateTime = DateTime.UtcNow
        };

        _context.MediaTags.Add(mediaTag);
        await _context.SaveChangesAsync();
    }

    private async Task CreateStaffAsync(int libraryId, int mediaId, string mediaType, StaffItemDto staffItem)
    {
        // 查找或创建 Staff
        var staff = await _context.Staffs.FirstOrDefaultAsync(s => s.Name == staffItem.Name);
        if (staff == null)
        {
            staff = new Staff { Name = staffItem.Name };
            _context.Staffs.Add(staff);
            await _context.SaveChangesAsync();
        }

        // 创建 MediaStaff 关联
        var mediaStaff = new MediaStaff
        {
            MediaType = mediaType,
            MediaId = mediaId,
            StaffId = staff.Id,
            RoleType = staffItem.Type,
            RoleName = staffItem.Role,
            CreateTime = DateTime.UtcNow,
            UpdateTime = DateTime.UtcNow
        };

        _context.MediaStaffs.Add(mediaStaff);
        await _context.SaveChangesAsync();
    }

    private async Task<PublishPathMapping> MoveFilesToLibraryAsync(
        StagingMedia stagingMedia,
        MediaLibrary library)
    {
        var mapping = new PublishPathMapping();

        // Store original paths before any moves
        var stagingDir = Path.GetDirectoryName(stagingMedia.VideoPath) ?? string.Empty;
        mapping.OriginalStagingDir = stagingDir;
        mapping.OriginalVideoPath = stagingMedia.VideoPath;
        mapping.OriginalPosterPath = stagingMedia.PosterPath;
        mapping.OriginalFanartPath = stagingMedia.FanartPath;
        mapping.OriginalThumbPath = stagingMedia.ThumbPath;

        // 构建目标目录路径
        var sanitizedTitle = SanitizeDirectoryName(stagingMedia.Code ?? stagingMedia.Title);
        var targetMediaDir = Path.Combine(library.Path, sanitizedTitle);

        // 创建目标目录
        Directory.CreateDirectory(targetMediaDir);

        // 移动视频文件
        var videoFileName = Path.GetFileName(stagingMedia.VideoPath);
        mapping.NewVideoPath = Path.Combine(targetMediaDir, videoFileName);
        File.Move(stagingMedia.VideoPath, mapping.NewVideoPath);
        _logger.LogInformation("Moved video from {Source} to {Destination}", stagingMedia.VideoPath, mapping.NewVideoPath);

        // 移动海报
        if (!string.IsNullOrEmpty(stagingMedia.PosterPath))
        {
            var posterFileName = Path.GetFileName(stagingMedia.PosterPath);
            mapping.NewPosterPath = Path.Combine(targetMediaDir, posterFileName);
            File.Move(stagingMedia.PosterPath, mapping.NewPosterPath);
            _logger.LogInformation("Moved poster from {Source} to {Destination}", stagingMedia.PosterPath, mapping.NewPosterPath);
        }

        // 移动粉丝图
        if (!string.IsNullOrEmpty(stagingMedia.FanartPath))
        {
            var fanartFileName = Path.GetFileName(stagingMedia.FanartPath);
            mapping.NewFanartPath = Path.Combine(targetMediaDir, fanartFileName);
            File.Move(stagingMedia.FanartPath, mapping.NewFanartPath);
            _logger.LogInformation("Moved fanart from {Source} to {Destination}", stagingMedia.FanartPath, mapping.NewFanartPath);
        }

        // 移动缩略图
        if (!string.IsNullOrEmpty(stagingMedia.ThumbPath))
        {
            var thumbFileName = Path.GetFileName(stagingMedia.ThumbPath);
            mapping.NewThumbPath = Path.Combine(targetMediaDir, thumbFileName);
            File.Move(stagingMedia.ThumbPath, mapping.NewThumbPath);
            _logger.LogInformation("Moved thumb from {Source} to {Destination}", stagingMedia.ThumbPath, mapping.NewThumbPath);
        }

        // 移动截图
        if (!string.IsNullOrEmpty(stagingMedia.ScreenshotsPath))
        {
            if (mapping.OriginalStagingDir != string.Empty)
            {
                var extrafanartDir = Path.Combine(mapping.OriginalStagingDir, "extrafanart");
                if (Directory.Exists(extrafanartDir))
                {
                    var targetExtrafanartDir = Path.Combine(targetMediaDir, "extrafanart");
                    Directory.CreateDirectory(targetExtrafanartDir);

                    var screenshotFiles = Directory.GetFiles(extrafanartDir);
                    foreach (var screenshotFile in screenshotFiles)
                    {
                        var fileName = Path.GetFileName(screenshotFile);
                        var targetPath = Path.Combine(targetExtrafanartDir, fileName);
                        File.Move(screenshotFile, targetPath);
                        mapping.NewScreenshotPaths.Add(targetPath);
                    }
                    _logger.LogInformation("Moved {Count} screenshots to {Destination}", screenshotFiles.Length, targetExtrafanartDir);
                }
            }
        }

        // 移动源目录下所有剩余文件
        if (mapping.OriginalStagingDir != string.Empty && Directory.Exists(mapping.OriginalStagingDir))
        {
            var movedFiles = new HashSet<string>
            {
                stagingMedia.VideoPath,
                stagingMedia.PosterPath ?? string.Empty,
                stagingMedia.FanartPath ?? string.Empty,
                stagingMedia.ThumbPath ?? string.Empty
            };

            // 获取源目录下所有文件（不包括 extrafanart 子目录的文件，因为已经处理过了）
            var allFiles = Directory.GetFiles(mapping.OriginalStagingDir, "*", SearchOption.TopDirectoryOnly);
            foreach (var sourceFile in allFiles)
            {
                if (!movedFiles.Contains(sourceFile))
                {
                    var fileName = Path.GetFileName(sourceFile);
                    var targetPath = Path.Combine(targetMediaDir, fileName);
                    File.Move(sourceFile, targetPath);
                    mapping.NewOtherFilePaths.Add(targetPath);
                    _logger.LogInformation("Moved extra file from {Source} to {Destination}", sourceFile, targetPath);
                }
            }
        }

        return mapping;
    }

    private async Task<(int mediaId, int movieId)> CreateMediaRecordsAsync(
        StagingMedia stagingMedia,
        MediaLibrary library,
        PublishRequest request,
        PublishPathMapping pathMapping)
    {
        // 1. 创建 Media 记录
        var media = new Media
        {
            LibraryId = request.LibraryId,
            Type = stagingMedia.Type,
            Name = request.MediaName,
            Title = stagingMedia.Title,
            OriginalTitle = stagingMedia.OriginalTitle,
            ReleaseDate = stagingMedia.Year?.ToString(),
            Summary = stagingMedia.Description,
            CreateTime = DateTime.UtcNow,
            UpdateTime = DateTime.UtcNow
        };

        _context.Medias.Add(media);
        await _context.SaveChangesAsync();

        // 2. 创建 Movie 记录
        var screenshotUrlNames = pathMapping.NewScreenshotPaths
            .Select(p => MediaUtils.GenerateUrlNameFromPath(p))
            .ToList();

        var movie = new Movie
        {
            MediaId = media.Id,
            LibraryId = request.LibraryId,
            Studio = stagingMedia.Studio,
            Runtime = stagingMedia.Runtime,
            Description = stagingMedia.Description,
            ScreenshotsPath = screenshotUrlNames.Count > 0 ? string.Join(",", screenshotUrlNames) : null,
            CreateTime = DateTime.UtcNow,
            UpdateTime = DateTime.UtcNow
        };

        _context.Movies.Add(movie);
        await _context.SaveChangesAsync();

        // 3. 创建 MediaFile 记录
        var fileInfo = new FileInfo(pathMapping.NewVideoPath);
        var mediaFile = new MediaFile
        {
            MediaId = media.Id,
            Path = pathMapping.NewVideoPath,
            FileName = fileInfo.Name,
            Extension = fileInfo.Extension,
            SizeBytes = fileInfo.Length,
            CreateTime = DateTime.UtcNow,
            UpdateTime = DateTime.UtcNow
        };

        _context.MediaFiles.Add(mediaFile);
        await _context.SaveChangesAsync();

        // 4. 创建 MediaImgs 记录
        if (pathMapping.NewPosterPath != null)
        {
            await CreateMediaImgAsync(media.Id, pathMapping.NewPosterPath, "poster");
        }

        if (pathMapping.NewFanartPath != null)
        {
            await CreateMediaImgAsync(media.Id, pathMapping.NewFanartPath, "fanart");
        }

        foreach (var screenshotPath in pathMapping.NewScreenshotPaths)
        {
            await CreateMediaImgAsync(media.Id, screenshotPath, "screenshot");
        }

        // 5. 处理 Tags
        if (!string.IsNullOrEmpty(stagingMedia.Tags))
        {
            try
            {
                var tags = JsonSerializer.Deserialize<List<string>>(stagingMedia.Tags);
                if (tags != null)
                {
                    foreach (var tagName in tags)
                    {
                        await CreateTagAsync(request.LibraryId, media.Id, stagingMedia.Type, tagName);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse tags for staging media {StagingId}", stagingMedia.Id);
            }
        }

        // 6. 处理 Staff
        if (!string.IsNullOrEmpty(stagingMedia.Staff))
        {
            try
            {
                var staffList = JsonSerializer.Deserialize<List<StaffItemDto>>(stagingMedia.Staff);
                if (staffList != null)
                {
                    foreach (var staffItem in staffList)
                    {
                        await CreateStaffAsync(request.LibraryId, media.Id, stagingMedia.Type, staffItem);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse staff for staging media {StagingId}", stagingMedia.Id);
            }
        }

        return (media.Id, movie.Id);
    }

    private async Task RollbackFileMoveAsync(PublishPathMapping pathMapping, StagingMedia stagingMedia)
    {
        try
        {
            // Use original paths from mapping instead of staging
            if (!string.IsNullOrEmpty(pathMapping.NewVideoPath) && File.Exists(pathMapping.NewVideoPath))
            {
                File.Move(pathMapping.NewVideoPath, pathMapping.OriginalVideoPath);
                _logger.LogInformation("Rolled back video to {Destination}", pathMapping.OriginalVideoPath);
            }

            if (pathMapping.NewPosterPath != null && pathMapping.OriginalPosterPath != null && File.Exists(pathMapping.NewPosterPath))
            {
                File.Move(pathMapping.NewPosterPath, pathMapping.OriginalPosterPath);
                _logger.LogInformation("Rolled back poster to {Destination}", pathMapping.OriginalPosterPath);
            }

            if (pathMapping.NewFanartPath != null && pathMapping.OriginalFanartPath != null && File.Exists(pathMapping.NewFanartPath))
            {
                File.Move(pathMapping.NewFanartPath, pathMapping.OriginalFanartPath);
                _logger.LogInformation("Rolled back fanart to {Destination}", pathMapping.OriginalFanartPath);
            }

            if (pathMapping.NewThumbPath != null && pathMapping.OriginalThumbPath != null && File.Exists(pathMapping.NewThumbPath))
            {
                File.Move(pathMapping.NewThumbPath, pathMapping.OriginalThumbPath);
                _logger.LogInformation("Rolled back thumb to {Destination}", pathMapping.OriginalThumbPath);
            }

            // 回滚截图
            if (pathMapping.NewScreenshotPaths.Count > 0)
            {
                var extrafanartDir = Path.Combine(pathMapping.OriginalStagingDir, "extrafanart");
                if (!Directory.Exists(extrafanartDir))
                {
                    Directory.CreateDirectory(extrafanartDir);
                }

                foreach (var screenshotPath in pathMapping.NewScreenshotPaths)
                {
                    if (File.Exists(screenshotPath))
                    {
                        var fileName = Path.GetFileName(screenshotPath);
                        var targetPath = Path.Combine(extrafanartDir, fileName);
                        File.Move(screenshotPath, targetPath);
                    }
                }
                _logger.LogInformation("Rolled back {Count} screenshots", pathMapping.NewScreenshotPaths.Count);
            }

            // 回滚额外移动的文件
            if (pathMapping.NewOtherFilePaths.Count > 0)
            {
                foreach (var sourceFile in pathMapping.NewOtherFilePaths)
                {
                    if (File.Exists(sourceFile))
                    {
                        var fileName = Path.GetFileName(sourceFile);
                        var targetPath = Path.Combine(pathMapping.OriginalStagingDir, fileName);
                        File.Move(sourceFile, targetPath);
                    }
                }
                _logger.LogInformation("Rolled back {Count} extra files", pathMapping.NewOtherFilePaths.Count);
            }

            _logger.LogWarning("Rolled back file move for staging media {StagingId}", stagingMedia.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to rollback file move for staging media {StagingId}", stagingMedia.Id);
            // 无法回滚，记录严重错误
        }
    }

    private void CleanupStagingDirectory(string stagingDir)
    {
        try
        {
            if (Directory.Exists(stagingDir))
            {
                Directory.Delete(stagingDir, true);
                _logger.LogInformation("Cleaned up staging directory {StagingDir}", stagingDir);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cleanup staging directory {StagingDir}", stagingDir);
            // 清理失败不影响发布成功，仅记录日志
        }
    }
}
