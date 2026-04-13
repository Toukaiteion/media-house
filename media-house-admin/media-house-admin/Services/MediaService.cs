using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class MediaService(
    MediaHouseDbContext context,
    IMetadataService metadataService,
    ILogger<MediaService> logger) : IMediaService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly IMetadataService _metadataService = metadataService;
    private readonly ILogger<MediaService> _logger = logger;

    public async Task<bool> UpdateMediaMetadataAsync(int mediaId, UpdateMediaMetadataDto dto)
    {
        try
        {
            // Query Media with all related entities
            var media = await _context.Medias
                .Include(m => m.Movie)
                .Include(m => m.MediaTags).ThenInclude(mt => mt.Tag)
                .Include(m => m.MediaStaffs).ThenInclude(ms => ms.Staff)
                .Include(m => m.MediaFiles)
                .FirstOrDefaultAsync(m => m.Id == mediaId);

            if (media == null)
            {
                return false;
            }

            // Update database
            bool needsSave = false;

            // Update Title
            if (dto.Title != null && media.Title != dto.Title)
            {
                media.Title = dto.Title;
                media.UpdateTime = DateTime.UtcNow;
                needsSave = true;
            }

            // Update Summary
            if (dto.Summary != null && media.Summary != dto.Summary)
            {
                media.Summary = dto.Summary;
                media.UpdateTime = DateTime.UtcNow;
                needsSave = true;
            }

            // Update Movie.Num
            if (dto.Num != null && media.Movie?.Num != dto.Num)
            {
                if (media.Movie != null)
                {
                    media.Movie.Num = dto.Num;
                    media.Movie.UpdateTime = DateTime.UtcNow;
                    needsSave = true;
                }
            }

            // Update Tags - delete old, create new
            if (dto.Tags != null)
            {
                // Remove old tags
                if (media.MediaTags != null && media.MediaTags.Count > 0)
                {
                    _context.MediaTags.RemoveRange(media.MediaTags);
                }

                // Add new tags
                if (dto.Tags.Count > 0)
                {
                    var libraryId = media.LibraryId;
                    var mediaType = "movie";

                    foreach (var tagName in dto.Tags)
                    {
                        // Find or create tag
                        var tag = await _context.Tags
                            .FirstOrDefaultAsync(t => t.TagName == tagName);

                        if (tag == null)
                        {
                            tag = new Tag { TagName = tagName };
                            _context.Tags.Add(tag);
                            await _context.SaveChangesAsync();
                        }

                        // Create MediaTag relation
                        var mediaTag = new MediaTag
                        {
                            MediaLibraryId = libraryId,
                            MediaType = mediaType,
                            MediaId = media.Id,
                            TagId = tag.Id
                        };
                        _context.MediaTags.Add(mediaTag);
                    }

                    needsSave = true;
                }
            }

            // Update Actors - delete old, create new
            if (dto.Actors != null)
            {
                // Remove old actor relations (but keep Staff entities)
                if (media.MediaStaffs != null && media.MediaStaffs.Count > 0)
                {
                    _context.MediaStaffs.RemoveRange(media.MediaStaffs);
                }

                // Add new actor relations
                if (dto.Actors.Count > 0)
                {
                    var mediaType = "movie";

                    foreach (var actorDto in dto.Actors)
                    {
                        // Find or create staff
                        var staff = await _context.Staffs
                            .FirstOrDefaultAsync(s => s.Name == actorDto.Name);

                        if (staff == null)
                        {
                            staff = new Staff { Name = actorDto.Name };
                            _context.Staffs.Add(staff);
                            await _context.SaveChangesAsync();
                        }

                        // Create MediaStaff relation
                        var mediaStaff = new MediaStaff
                        {
                            MediaType = mediaType,
                            MediaId = media.Id,
                            StaffId = staff.Id,
                            RoleType = "actor",
                            RoleName = actorDto.RoleName,
                            SortOrder = actorDto.SortOrder ?? 0
                        };
                        _context.MediaStaffs.Add(mediaStaff);
                    }

                    needsSave = true;
                }
            }

            if (needsSave)
            {
                await _context.SaveChangesAsync();
            }

            // Update NFO file
            var mediaFile = media.MediaFiles?.FirstOrDefault();
            if (mediaFile != null)
            {
                var directory = System.IO.Path.GetDirectoryName(mediaFile.Path);
                var nfoPath = System.IO.Path.Combine(directory ?? "",
                    System.IO.Path.GetFileNameWithoutExtension(mediaFile.FileName) + ".nfo");

                // Build NFO update data
                var actorsData = dto.Actors?
                    .Select(a => new ActorData(a.Name, a.RoleName))
                    .ToList() ?? [];

                var nfoUpdateData = new NfoUpdateData(
                    Title: dto.Title,
                    Num: dto.Num,
                    Summary: dto.Summary,
                    Tags: dto.Tags,
                    Actors: actorsData
                );

                var nfoUpdated = await _metadataService.WriteNfoFileAsync(nfoPath, nfoUpdateData);

                if (!nfoUpdated)
                {
                    _logger.LogWarning("Failed to update NFO file: {NfoPath}", nfoPath);
                }
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating metadata for media {MediaId}", mediaId);
            return false;
        }
    }
}
