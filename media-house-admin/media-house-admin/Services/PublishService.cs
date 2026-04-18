using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace MediaHouse.Services;

public class PublishService(
    MediaHouseDbContext context,
    ILogger<PublishService> logger) : IPublishService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<PublishService> _logger = logger;

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

        // 开始事务
        using var transaction = await _context.Database.BeginTransactionAsync();

        try
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
            var movie = new Movie
            {
                MediaId = media.Id,
                LibraryId = request.LibraryId,
                Studio = stagingMedia.Studio,
                Runtime = stagingMedia.Runtime,
                Description = stagingMedia.Description,
                ScreenshotsPath = stagingMedia.ScreenshotsPath,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };

            _context.Movies.Add(movie);
            await _context.SaveChangesAsync();

            // 3. 创建 MediaFile 记录
            var fileInfo = new FileInfo(stagingMedia.VideoPath);
            var mediaFile = new MediaFile
            {
                MediaId = media.Id,
                Path = stagingMedia.VideoPath,
                FileName = fileInfo.Name,
                Extension = fileInfo.Extension,
                SizeBytes = fileInfo.Length,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };

            _context.MediaFiles.Add(mediaFile);
            await _context.SaveChangesAsync();

            // 4. 创建 MediaImgs 记录
            if (!string.IsNullOrEmpty(stagingMedia.PosterPath))
            {
                await CreateMediaImgAsync(media.Id, stagingMedia.PosterPath, "poster");
            }

            if (!string.IsNullOrEmpty(stagingMedia.FanartPath))
            {
                await CreateMediaImgAsync(media.Id, stagingMedia.FanartPath, "fanart");
            }

            // 处理截图
            if (!string.IsNullOrEmpty(stagingMedia.ScreenshotsPath))
            {
                var screenshots = stagingMedia.ScreenshotsPath.Split(',');
                var extrafanartDir = Path.GetDirectoryName(stagingMedia.VideoPath);
                if (extrafanartDir != null)
                {
                    var screenshotFiles = Directory.GetFiles(Path.Combine(extrafanartDir, "extrafanart"));
                    foreach (var screenshot in screenshotFiles)
                    {
                        await CreateMediaImgAsync(media.Id, screenshot, "screenshot");
                    }
                }
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
                    _logger.LogWarning(ex, "Failed to parse tags for staging media {StagingId}", stagingMediaId);
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
                    _logger.LogWarning(ex, "Failed to parse staff for staging media {StagingId}", stagingMediaId);
                }
            }

            // 7. 更新 StagingMedia 状态
            stagingMedia.Status = 2; // 已发布
            stagingMedia.PublishedAt = DateTime.UtcNow;
            stagingMedia.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            // 提交事务
            await transaction.CommitAsync();

            _logger.LogInformation("Published staging {StagingId} to library {LibraryId} as media {MediaId}",
                stagingMediaId, request.LibraryId, media.Id);

            return new PublishResponseDto
            {
                MediaId = media.Id,
                MovieId = movie.Id,
                Status = "published"
            };
        }
        catch
        {
            await transaction.RollbackAsync();
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
}
