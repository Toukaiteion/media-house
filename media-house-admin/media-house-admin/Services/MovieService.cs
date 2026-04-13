using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class MovieService(MediaHouseDbContext context, ILogger<MovieService> logger) : IMovieService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<MovieService> _logger = logger;

    public async Task<PagedResponseDto<MovieDto>> GetMoviesAsync(MovieQueryDto query)
    {
        // Start with base query
        var mediaQuery = _context.Medias
            .Include(m => m.Movie)
            .Where(m => m.Type == "movie");

        // Pre-query favorited media IDs if user ID is provided
        HashSet<int>? favoritedMediaIds = null;
        query.UserId = 1;
        if (query.UserId.HasValue)
        {
            var favorList = await _context.MyFavors
                .Where(f => f.UserId == query.UserId.Value)
                .Select(f => f.MediaId)
                .ToListAsync();
            favoritedMediaIds = new HashSet<int>(favorList);
        }

        // Search filter (按name或title模糊查询)
        if (!string.IsNullOrEmpty(query.Search))
        {
            mediaQuery = mediaQuery.Where(m => m.Name.Contains(query.Search) || m.Title.Contains(query.Search));
        }

        // Library filter
        if (query.LibraryId.HasValue)
        {
            mediaQuery = mediaQuery.Where(m => m.LibraryId == query.LibraryId.Value);
        }

        // Favor filter (combinable)
        if (query.Favor == true && query.UserId.HasValue)
        {
            var favorMediaIds = await _context.MyFavors
                .Where(f => f.UserId == query.UserId.Value)
                .Select(f => f.MediaId)
                .ToListAsync();

            mediaQuery = mediaQuery.Where(m => favorMediaIds.Contains(m.Id));
        }

        // Tags filter (按tagIds筛选，逗号分隔)
        if (!string.IsNullOrEmpty(query.Tags))
        {
            var tagIds = query.Tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(t => int.Parse(t.Trim()))
                .ToList();

            mediaQuery = mediaQuery
                .Include(m => m.MediaTags)
                .Where(m => m.MediaTags
                    .Any(mt => tagIds.Contains(mt.TagId)));
        }

        // Actor filter (combinable)
        if (query.ActorId.HasValue)
        {
            mediaQuery = mediaQuery
                .Include(m => m.MediaStaffs)
                .Where(m => m.MediaStaffs
                    .Any(ms => ms.StaffId == query.ActorId.Value));
        }

        // Apply sorting
        var sortBy = query.SortBy?.ToLower() ?? "default";
        var isAscending = (query.SortOrder?.ToLower() ?? "desc") == "asc";

        IOrderedQueryable<Media>? orderedQuery = null;

        switch (sortBy)
        {
            case "recent":
                if (query.UserId.HasValue)
                {
                    var playRecordsQuery = _context.PlayRecords
                        .Where(pr => pr.UserId == query.UserId.Value);

                    var playRecords = isAscending
                        ? await playRecordsQuery.OrderBy(pr => pr.LastPlayTime).ToListAsync()
                        : await playRecordsQuery.OrderByDescending(pr => pr.LastPlayTime).ToListAsync();

                    var mediaIds = playRecords.Select(pr => pr.MediaId).ToList();

                    var idToIndex = mediaIds
                        .Select((id, index) => (id, index))
                        .ToDictionary(x => x.id, x => x.index);

                    mediaQuery = mediaQuery.Where(m => mediaIds.Contains(m.Id));
                    var medias = await mediaQuery.ToListAsync();
                    medias = [.. medias.OrderBy(m => idToIndex.GetValueOrDefault(m.Id, int.MaxValue))];

                    var totalCount = await mediaQuery.CountAsync();
                    var pagedMedias = medias
                        .Skip((query.Page - 1) * query.PageSize)
                        .Take(query.PageSize)
                        .ToList();

                    return new PagedResponseDto<MovieDto>
                    {
                        Items = pagedMedias.Select(m => MapToDto(m, favoritedMediaIds)).ToList(),
                        TotalCount = totalCount,
                        Page = query.Page,
                        PageSize = query.PageSize
                    };
                }
                orderedQuery = isAscending ? mediaQuery.OrderBy(m => m.Id) : mediaQuery.OrderByDescending(m => m.Id);
                break;

            case "mostly_play":
                orderedQuery = isAscending
                    ? mediaQuery.OrderBy(m => m.PlayCount ?? 0)
                    : mediaQuery.OrderByDescending(m => m.PlayCount ?? 0);
                break;

            case "name":
                orderedQuery = isAscending
                    ? mediaQuery.OrderBy(m => m.Name)
                    : mediaQuery.OrderByDescending(m => m.Name);
                break;

            case "release_date":
                orderedQuery = isAscending
                    ? mediaQuery.OrderBy(m => m.ReleaseDate)
                    : mediaQuery.OrderByDescending(m => m.ReleaseDate);
                break;

            case "create_time":
                orderedQuery = isAscending
                    ? mediaQuery.OrderBy(m => m.CreateTime)
                    : mediaQuery.OrderByDescending(m => m.CreateTime);
                break;

            default:
                orderedQuery = isAscending
                    ? mediaQuery.OrderBy(m => m.Id)
                    : mediaQuery.OrderByDescending(m => m.Id);
                break;
        }

        var totalCountDefault = await orderedQuery!.CountAsync();

        var mediasDefault = await orderedQuery
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync();

        return new PagedResponseDto<MovieDto>
        {
            Items = mediasDefault.Select(m => MapToDto(m, favoritedMediaIds)).ToList(),
            TotalCount = totalCountDefault,
            Page = query.Page,
            PageSize = query.PageSize
        };
    }

    public async Task<bool> DeleteMovieAsync(int mediaId)
    {
        var media = await _context.Medias
            .Include(m => m.MediaFiles)
            .Include(m => m.MediaImgs)
            .Include(m => m.Movie)
            .FirstOrDefaultAsync(m => m.Id == mediaId);

        if (media == null)
        {
            return false;
        }

        // Collect file paths to delete
        var filePathsToDelete = new List<string>();

        if (media.MediaFiles != null)
        {
            foreach (var mediaFile in media.MediaFiles)
            {
                if (!string.IsNullOrEmpty(mediaFile.Path) && System.IO.File.Exists(mediaFile.Path))
                {
                    filePathsToDelete.Add(mediaFile.Path);
                }
            }
        }

        if (media.MediaImgs != null)
        {
            foreach (var mediaImg in media.MediaImgs)
            {
                if (!string.IsNullOrEmpty(mediaImg.Path) && System.IO.File.Exists(mediaImg.Path))
                {
                    filePathsToDelete.Add(mediaImg.Path);
                }
            }
        }

        // Get movie directory path (from Media)
        string? directoryToDelete = null;
        var firstMediaFile = media.MediaFiles?.FirstOrDefault();
        if (firstMediaFile != null && !string.IsNullOrEmpty(firstMediaFile.Path))
        {
            directoryToDelete = System.IO.Path.GetDirectoryName(firstMediaFile.Path);
        }

        // Remove media from database (cascade delete will handle related records)
        _context.Medias.Remove(media);
        await _context.SaveChangesAsync();

        // Delete files after successful database deletion
        foreach (var filePath in filePathsToDelete)
        {
            try
            {
                if (System.IO.File.Exists(filePath))
                {
                    System.IO.File.Delete(filePath);
                    _logger.LogInformation("Deleted file: {FilePath}", filePath);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete file {FilePath}", filePath);
            }
        }

        // Delete directory if it exists and is empty
        if (!string.IsNullOrEmpty(directoryToDelete) && System.IO.Directory.Exists(directoryToDelete))
        {
            try
            {
                var filesInDir = System.IO.Directory.GetFiles(directoryToDelete);
                if (filesInDir.Length == 0)
                {
                    System.IO.Directory.Delete(directoryToDelete);
                    _logger.LogInformation("Deleted empty directory: {Directory}", directoryToDelete);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete directory {Directory}", directoryToDelete);
            }
        }

        return true;
    }

    public async Task<MovieDetailDto?> GetMovieAsync(int id, int? userId = null)
    {
        var media = await _context.Medias
            .Include(m => m.Movie)
            .Include(m => m.MediaFiles)
            .Include(m => m.MediaImgs)
            .Include(m => m.MediaTags)
                .ThenInclude(mt => mt.Tag)
            .Include(m => m.MediaStaffs)
                .ThenInclude(ms => ms.Staff)
            .FirstOrDefaultAsync(m => m.Id == id && m.Type == "movie");

        if (media == null)
        {
            return null;
        }

        // Check if favorited by user
        bool isFavorited = false;
        if (userId.HasValue)
        {
            isFavorited = await _context.MyFavors
                .AnyAsync(mf => mf.UserId == userId.Value && mf.MediaId == id && mf.MediaType == "movie");
        }

        return MapToDetailDto(media, isFavorited);
    }

    public async Task<List<TagWithMoviesDto>> GetMoviesByTagsAsync(int? userId, MediaRecommendationQueryDto query)
    {
        // Get user's favorite movie IDs
        var favoriteMediaIds = await _context.MyFavors
            .Where(f => f.UserId == userId && f.MediaType == "movie")
            .Select(f => f.MediaId)
            .ToListAsync();

        if (favoriteMediaIds.Count == 0)
        {
            return [];
        }

        // Get all tags from favorite movies with their frequency
        var tagsByFrequency = await _context.MediaTags
            .Where(mt => favoriteMediaIds.Contains(mt.MediaId))
            .GroupBy(mt => mt.TagId)
            .Select(g => new { TagId = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .Take(query.TagNum)
            .ToListAsync();

        if (tagsByFrequency.Count == 0)
        {
            return [];
        }

        var topTagIds = tagsByFrequency.Select(t => t.TagId).ToList();
        var result = new List<TagWithMoviesDto>();

        // Get favorited media IDs for IsFavorited property
        var favoritedMediaIdsSet = new HashSet<int>(favoriteMediaIds);

        // Get tag information for all top tags
        var tags = await _context.Tags
            .Where(t => topTagIds.Contains(t.Id))
            .ToListAsync();

        // For each top tag, query movies
        foreach (var tagInfo in tagsByFrequency)
        {
            var tag = tags.FirstOrDefault(t => t.Id == tagInfo.TagId);
            if (tag == null) continue;

            IQueryable<Media> moviesQuery = _context.Medias
                .Include(m => m.Movie)
                .Where(m => m.Type == "movie")
                .Where(m => m.MediaTags.Any(mt => mt.TagId == tagInfo.TagId));

            // Apply ordering based on MediaSearchType
            if (query.MediaSearchType.ToLower() == "create_time")
            {
                moviesQuery = moviesQuery.OrderByDescending(m => m.CreateTime);
            }

            var movies = await moviesQuery.Take(query.MediaNum).ToListAsync();

            // Random shuffle if needed
            if (query.MediaSearchType.ToLower() == "random")
            {
                var random = new Random();
                movies = [.. movies.OrderBy(x => random.Next())];
            }

            var movieDtos = movies.Select(m => MapToDto(m, favoritedMediaIdsSet)).ToList();

            // Get total media count for this tag
            var totalMediaCount = await _context.MediaTags
                .Where(mt => mt.TagId == tagInfo.TagId)
                .CountAsync();

            result.Add(new TagWithMoviesDto
            {
                Id = tag.Id.ToString(),
                TagName = tag.TagName,
                MediaCount = totalMediaCount,
                Movies = movieDtos
            });
        }

        return result;
    }

    public async Task<List<ActorWithMoviesDto>> GetMoviesByActorsAsync(int? userId, MediaRecommendationQueryDto query)
    {
        // Get user's favorite movie IDs
        var favoriteMediaIds = await _context.MyFavors
            .Where(f => f.UserId == userId && f.MediaType == "movie")
            .Select(f => f.MediaId)
            .ToListAsync();

        if (favoriteMediaIds.Count == 0)
        {
            return [];
        }

        // Get all actors (staff with RoleType == "actor") from favorite movies with their frequency
        var actorsByFrequency = await _context.MediaStaffs
            .Where(ms => favoriteMediaIds.Contains(ms.MediaId) &&
                        ms.MediaType == "movie" &&
                        ms.RoleType.ToLower() == "actor")
            .GroupBy(ms => ms.StaffId)
            .Select(g => new { StaffId = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .Take(query.TagNum)
            .ToListAsync();

        if (actorsByFrequency.Count == 0)
        {
            return [];
        }

        var topStaffIds = actorsByFrequency.Select(a => a.StaffId).ToList();
        var result = new List<ActorWithMoviesDto>();

        // Get favorited media IDs for IsFavorited property
        var favoritedMediaIdsSet = new HashSet<int>(favoriteMediaIds);

        // Get staff information for all top staff
        var staffs = await _context.Staffs
            .Where(s => topStaffIds.Contains(s.Id))
            .ToListAsync();

        // For each top actor, query movies
        foreach (var actorInfo in actorsByFrequency)
        {
            var staff = staffs.FirstOrDefault(s => s.Id == actorInfo.StaffId);
            if (staff == null) continue;

            IQueryable<Media> moviesQuery = _context.Medias
                .Include(m => m.Movie)
                .Where(m => m.Type == "movie")
                .Where(m => m.MediaStaffs.Any(ms =>
                    ms.StaffId == actorInfo.StaffId &&
                    ms.MediaType == "movie" &&
                    ms.RoleType.ToLower() == "actor"));

            // Apply ordering based on MediaSearchType
            if (query.MediaSearchType.ToLower() == "create_time")
            {
                moviesQuery = moviesQuery.OrderByDescending(m => m.CreateTime);
            }

            var movies = await moviesQuery.Take(query.MediaNum).ToListAsync();

            // Random shuffle if needed
            if (query.MediaSearchType.ToLower() == "random")
            {
                var random = new Random();
                movies = [.. movies.OrderBy(x => random.Next())];
            }

            var movieDtos = movies.Select(m => MapToDto(m, favoritedMediaIdsSet)).ToList();

            // Get total media count for this staff as actor
            var totalMediaCount = await _context.MediaStaffs
                .Where(ms => ms.StaffId == actorInfo.StaffId &&
                            ms.MediaType == "movie" &&
                            ms.RoleType.ToLower() == "actor")
                .CountAsync();

            result.Add(new ActorWithMoviesDto
            {
                Id = staff.Id.ToString(),
                Name = staff.Name,
                AvatarPath = staff.AvatarPath,
                MediaCount = totalMediaCount,
                Movies = movieDtos
            });
        }

        return result;
    }

    private MovieDto MapToDto(Media media, HashSet<int>? favoritedMediaIds = null)
    {
        int? year = null;
        if (!string.IsNullOrEmpty(media.ReleaseDate) && DateTime.TryParse(media.ReleaseDate, out var releaseDate))
        {
            year = releaseDate.Year;
        }

        return new MovieDto
        {
            Id = media.Id.ToString(),
            Title = media.Title,
            Year = year,
            PosterPath = media.PosterPath,
            ThumbPath = media.ThumbPath,
            FanartPath = media.FanartPath,
            Overview = media.Summary ?? media.Movie?.Description,
            CreatedAt = media.CreateTime,
            MediaLibraryId = media.LibraryId.ToString(),
            PlayCount = media.PlayCount,
            IsFavorited = favoritedMediaIds?.Contains(media.Id) ?? false
        };
    }

    private static MovieDetailDto MapToDetailDto(Media media, bool isFavorited = false)
    {
        int? year = null;
        if (!string.IsNullOrEmpty(media.ReleaseDate) && DateTime.TryParse(media.ReleaseDate, out var releaseDate))
        {
            year = releaseDate.Year;
        }

        var mediaFile = media.MediaFiles?.FirstOrDefault();

        // Get screenshots from Movie.ScreenshotsPath (comma-separated url_names)
        var screenshotUrlNames = media.Movie?.ScreenshotsPath?
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim())
            .Where(s => !string.IsNullOrEmpty(s))
            .ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];

        // Combine with screenshots from MediaImgs where Type == "screenshot"
        var screenshots = media.MediaImgs?
            .Where(mi => mi.Type?.ToLower() == "screenshot" || screenshotUrlNames.Contains(mi.UrlName))
            .OrderBy(mi => mi.Name) // Sort by name for consistent ordering
            .Select(mi => new ScreenshotDto
            {
                UrlName = mi.UrlName,
                Name = mi.Name,
                Path = mi.Path,
                Width = mi.Width,
                Height = mi.Height,
                SizeBytes = mi.SizeBytes
            })
            .ToList() ?? [];

        // Group staff by role type
        var actors = new List<StaffDto>();
        var directors = new List<StaffDto>();
        var writers = new List<StaffDto>();

        if (media.MediaStaffs != null)
        {
            foreach (var mediaStaff in media.MediaStaffs.OrderByDescending(ms => ms.SortOrder))
            {
                if (mediaStaff.Staff == null) continue;

                var staffDto = new StaffDto
                {
                    Id = mediaStaff.Staff.Id.ToString(),
                    Name = mediaStaff.Staff.Name,
                    AvatarPath = mediaStaff.Staff.AvatarPath,
                    RoleName = mediaStaff.RoleName
                };

                var roleType = mediaStaff.RoleType.ToLowerInvariant();
                if (roleType == "actor")
                {
                    actors.Add(staffDto);
                }
                else if (roleType == "director")
                {
                    directors.Add(staffDto);
                }
                else if (roleType == "writer")
                {
                    writers.Add(staffDto);
                }
            }
        }

        // Get tags
        var tags = media.MediaTags?
            .Where(mt => mt.Tag != null)
            .Select(mt => new TagDto
            {
                Id = mt.Tag!.Id.ToString(),
                TagName = mt.Tag.TagName
            })
            .ToList() ?? [];

        return new MovieDetailDto
        {
            Id = media.Id.ToString(),
            Title = media.Title,
            OriginalTitle = media.OriginalTitle,
            Year = year,
            ReleaseDate = media.ReleaseDate,
            PosterPath = media.PosterPath,
            ThumbPath = media.ThumbPath,
            FanartPath = media.FanartPath,
            Overview = media.Summary ?? media.Movie?.Description,
            CreatedAt = media.CreateTime,
            MediaLibraryId = media.LibraryId.ToString(),
            FilePath = mediaFile?.Path,
            ContainerFormat = mediaFile?.Container,
            Duration = media.Movie?.Runtime ?? mediaFile?.Runtime,
            FileSize = mediaFile?.SizeBytes,
            Num = media.Movie?.Num,
            Studio = media.Movie?.Studio,
            Maker = media.Movie?.Maker,
            Screenshots = screenshots,
            Actors = actors,
            Directors = directors,
            Writers = writers,
            Tags = tags,
            IsFavorited = isFavorited
        };
    }
}
