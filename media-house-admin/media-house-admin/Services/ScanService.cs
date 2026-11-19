using MediaHouse.Config;
using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using MediaHouse.DTOs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MediaHouse.Services;

public class ScanService(
    IServiceScopeFactory scopeFactory,
    ILogger<ScanService> logger,
    IMetadataService metadataService,
    MediaHouseDbContext context,
    IOptions<ScanOptions> scanOptions) : IScanService
{
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<ScanService> _logger = logger;
    private readonly IMetadataService _metadataService = metadataService;
    private readonly MediaHouseDbContext _context = context;
    private readonly ScanOptions _scanOptions = scanOptions.Value;

    private static readonly string[] VideoExtensions = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm"];
    private static readonly string[] ScreenshotExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    public async Task<SystemSyncLog> StartFullScanAsync(int libraryId)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        var library = await context.MediaLibraries.FindAsync(libraryId) ??
            throw new InvalidOperationException($"Library {libraryId} not found");

        library.Status = ScanStatus.Scanning;
        await context.SaveChangesAsync();

        var log = new SystemSyncLog
        {
            MediaLibraryId = libraryId,
            SyncType = SyncType.FullScan,
            Status = SyncStatus.Started,
            StartTime = DateTime.UtcNow
        };

        context.SystemSyncLogs.Add(log);
        await context.SaveChangesAsync();

        _ = Task.Run(() => ExecuteFullScanAsync(libraryId, library.Path), CancellationToken.None);

        return log;
    }

    public async Task<SystemSyncLog> StartIncrementalScanAsync(int libraryId)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        var library = await context.MediaLibraries.FindAsync(libraryId) ??
            throw new InvalidOperationException($"Library {libraryId} not found");

        library.Status = ScanStatus.Scanning;
        await context.SaveChangesAsync();

        var log = new SystemSyncLog
        {
            MediaLibraryId = libraryId,
            SyncType = SyncType.IncrementalScan,
            Status = SyncStatus.Started,
            StartTime = DateTime.UtcNow
        };

        context.SystemSyncLogs.Add(log);
        await context.SaveChangesAsync();

        _ = Task.Run(() => ExecuteIncrementalScanAsync(libraryId, library.Path), CancellationToken.None);

        return log;
    }

    public async Task<SystemSyncLog?> GetLatestScanLogAsync(int libraryId)
    {
        return await _context.SystemSyncLogs
            .Where(sl => sl.MediaLibraryId == libraryId)
            .OrderByDescending(sl => sl.StartTime)
            .FirstOrDefaultAsync();
    }

    public async Task<List<SystemSyncLog>> GetScanLogsAsync(int libraryId, int limit = 10)
    {
        return await _context.SystemSyncLogs
            .Where(sl => sl.MediaLibraryId == libraryId)
            .OrderByDescending(sl => sl.StartTime)
            .Take(limit)
            .ToListAsync();
    }

    private async Task ExecuteFullScanAsync(int libraryId, string libraryPath)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        try
        {
            var log = await context.SystemSyncLogs
                .Where(sl => sl.MediaLibraryId == libraryId && sl.SyncType == SyncType.FullScan && sl.Status == SyncStatus.Started)
                .OrderByDescending(sl => sl.StartTime)
                .FirstOrDefaultAsync();

            if (log == null)
            {
                _logger.LogWarning("No pending scan log found for {LibraryId}", libraryId);
                return;
            }

            var library = await context.MediaLibraries.FindAsync(libraryId);
            if (library == null)
            {
                _logger.LogWarning("Library not found: {LibraryId}", libraryId);
                log.Status = SyncStatus.Failed;
                log.ErrorMessage = "Library not found";
                log.EndTime = DateTime.UtcNow;
                await context.SaveChangesAsync();
                return;
            }

            log.Status = SyncStatus.InProgress;
            await context.SaveChangesAsync();

            _logger.LogInformation("Starting full scan for library {LibraryId} at {Path}", libraryId, libraryPath);

            var movieDirectories = GetMovieDirectories(libraryPath);
            _logger.LogInformation("Found {Count} movie directories to scan", movieDirectories.Count);

            foreach (var movieDir in movieDirectories)
            {
                await ProcessMovieDirectoryAsync(context, libraryId, libraryPath, movieDir[0], movieDir[1], log);
                await context.SaveChangesAsync();
            }

            // 清理磁盘上已经不存在的媒体（这一步必须在遍历完所有目录之后做）
            var deletedCount = await PruneMissingMediaAsync(context, libraryId, movieDirectories, log);

            log.Status = SyncStatus.Completed;
            log.EndTime = DateTime.UtcNow;

            library.Status = ScanStatus.Idle;
            library.UpdateTime = DateTime.UtcNow;

            await context.SaveChangesAsync();
            _logger.LogInformation(
                "Full scan completed for library {LibraryId}. Added: {Added}, Updated: {Updated}, Deleted: {Deleted}",
                libraryId, log.AddedCount, log.UpdatedCount, deletedCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Full scan failed for library {LibraryId}", libraryId);

            var log = await context.SystemSyncLogs
                .Where(sl => sl.MediaLibraryId == libraryId && sl.SyncType == SyncType.FullScan && (sl.Status == SyncStatus.Started || sl.Status == SyncStatus.InProgress))
                .OrderByDescending(sl => sl.StartTime)
                .FirstOrDefaultAsync();

            if (log != null)
            {
                log.Status = SyncStatus.Failed;
                log.ErrorMessage = ex.Message;
                log.EndTime = DateTime.UtcNow;
                await context.SaveChangesAsync();
            }

            var library = await context.MediaLibraries.FindAsync(libraryId);
            if (library != null)
            {
                library.Status = ScanStatus.Error;
                library.UpdateTime = DateTime.UtcNow;
                await context.SaveChangesAsync();
            }
        }
    }

    private async Task ExecuteIncrementalScanAsync(int libraryId, string libraryPath)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        try
        {
            var log = await context.SystemSyncLogs
                .Where(sl => sl.MediaLibraryId == libraryId && sl.SyncType == SyncType.IncrementalScan && sl.Status == SyncStatus.Started)
                .OrderByDescending(sl => sl.StartTime)
                .FirstOrDefaultAsync();

            if (log == null)
            {
                _logger.LogWarning("No pending incremental scan log found for {LibraryId}", libraryId);
                return;
            }

            var library = await context.MediaLibraries.FindAsync(libraryId);
            if (library == null)
            {
                _logger.LogWarning("Library not found: {LibraryId}", libraryId);
                log.Status = SyncStatus.Failed;
                log.ErrorMessage = "Library not found";
                log.EndTime = DateTime.UtcNow;
                await context.SaveChangesAsync();
                return;
            }

            log.Status = SyncStatus.InProgress;
            await context.SaveChangesAsync();

            _logger.LogInformation("Starting incremental scan for library {LibraryId} at {Path}", libraryId, libraryPath);

            // 获取所有电影目录
            var movieDirectories = GetMovieDirectories(libraryPath);
            _logger.LogInformation("Found {Count} movie directories total", movieDirectories.Count);

            // 判断“哪些目录已经入库”必须按磁盘目录比对，不能拿 Media.Name 比目录名：
            // Name 存的是 NFO 里的 Num，和目录名经常不一致，会导致同一个目录每次增量扫描都被当成新目录重复处理。
            var existingFilePaths = await context.MediaFiles
                .Where(mf => mf.Media != null && mf.Media.LibraryId == libraryId)
                .Select(mf => mf.Path)
                .ToListAsync();

            var scannedDirs = new HashSet<string>(PathComparer);
            foreach (var path in existingFilePaths)
            {
                var dir = NormalizePath(Path.GetDirectoryName(path));
                if (dir == null) continue;

                // 文件已经不在磁盘上（被改名/换片），这个目录也要重新处理一次，
                // 否则旧路径会一直留在库里，表现为“文件明明在但播放 404”。
                if (!File.Exists(path)) continue;

                scannedDirs.Add(dir);
            }

            // 过滤出新增的电影目录
            var newMovieDirs = movieDirectories
                .Where(dir => NormalizePath(dir[1]) is not { } normalized || !scannedDirs.Contains(normalized))
                .ToList();

            _logger.LogInformation("Found {Count} new movie directories to scan", newMovieDirs.Count);

            foreach (var movieDir in newMovieDirs)
            {
                await ProcessMovieDirectoryAsync(context, libraryId, libraryPath, movieDir[0], movieDir[1], log);
                await context.SaveChangesAsync();
            }

            var deletedCount = await PruneMissingMediaAsync(context, libraryId, movieDirectories, log);

            log.Status = SyncStatus.Completed;
            log.EndTime = DateTime.UtcNow;

            library.Status = ScanStatus.Idle;
            library.UpdateTime = DateTime.UtcNow;

            await context.SaveChangesAsync();
            _logger.LogInformation(
                "Incremental scan completed for library {LibraryId}. Added: {Added}, Deleted: {Deleted}",
                libraryId, log.AddedCount, deletedCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Incremental scan failed for library {LibraryId}", libraryId);

            var log = await context.SystemSyncLogs
                .Where(sl => sl.MediaLibraryId == libraryId && sl.SyncType == SyncType.IncrementalScan && (sl.Status == SyncStatus.Started || sl.Status == SyncStatus.InProgress))
                .OrderByDescending(sl => sl.StartTime)
                .FirstOrDefaultAsync();

            if (log != null)
            {
                log.Status = SyncStatus.Failed;
                log.ErrorMessage = ex.Message;
                log.EndTime = DateTime.UtcNow;
                await context.SaveChangesAsync();
            }

            var library = await context.MediaLibraries.FindAsync(libraryId);
            if (library != null)
            {
                library.Status = ScanStatus.Error;
                library.UpdateTime = DateTime.UtcNow;
                await context.SaveChangesAsync();
            }
        }
    }

    /// <summary>
    /// 获取所有电影目录（递归扫描）
    /// </summary>
    private List<string[]> GetMovieDirectories(string libraryPath)
    {
        var movieDirs = new List<string[]>();

        if (!Directory.Exists(libraryPath))
        {
            _logger.LogWarning("Library path does not exist: {Path}", libraryPath);
            return movieDirs;
        }

        foreach (var dir in Directory.GetDirectories(libraryPath))
        {
            if (IsMovieDirectory(dir))
            {
                // 找到电影目录，添加到结果，不再递归扫描其子目录
                var dirName = Path.GetFileName(dir);
                movieDirs.Add([dirName, dir]);
            }
            else
            {
                // 不是电影目录，递归扫描子目录
                var subDirs = GetMovieDirectories(dir);
                movieDirs.AddRange(subDirs);
            }
        }

        return movieDirs;
    }

    /// <summary>
    /// 判断是否为电影目录（包含视频文件或NFO文件）
    /// </summary>
    private bool IsMovieDirectory(string directoryPath)
    {
        if (!Directory.Exists(directoryPath))
            return false;

        var files = Directory.GetFiles(directoryPath);
        var hasVideoFile = files.Any(f => VideoExtensions.Contains(Path.GetExtension(f).ToLower()));

        if (hasVideoFile)
            return true;

        var hasNfoFile = files.Any(f => f.EndsWith(".nfo", StringComparison.OrdinalIgnoreCase));

        return hasNfoFile;
    }

    /// <summary>
    /// 查找视频文件
    /// </summary>
    private string? FindVideoFile(string directoryPath)
    {
        if (!Directory.Exists(directoryPath))
            return null;

        var files = Directory.GetFiles(directoryPath);
        return files.FirstOrDefault(f => VideoExtensions.Contains(Path.GetExtension(f).ToLower()));
    }

    /// <summary>
    /// 查找NFO文件
    /// </summary>
    private string? FindNfoFile(string directoryPath)
    {
        if (!Directory.Exists(directoryPath))
            return null;

        var files = Directory.GetFiles(directoryPath);
        return files.FirstOrDefault(f => f.EndsWith(".nfo", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// 查找 extrafanart 子目录
    /// </summary>
    private string? FindExtrafanartDirectory(string movieDirPath)
    {
        var extrafanartPath = Path.Combine(movieDirPath, "extrafanart");
        return Directory.Exists(extrafanartPath) ? extrafanartPath : null;
    }

    /// <summary>
    /// 处理截图文件，返回用逗号分隔的 url_name 列表
    /// </summary>
    /// <param name="extrafanartDir">extrafanart 目录路径</param>
    /// <returns>用逗号分隔的 url_name 列表</returns>
    private string ProcessScreenshots(string extrafanartDir)
    {
        var screenshotUrlNames = new List<string>();

        if (!Directory.Exists(extrafanartDir))
            return string.Join(",", screenshotUrlNames);

        var files = Directory.GetFiles(extrafanartDir);

        foreach (var file in files)
        {
            var extension = Path.GetExtension(file).ToLower();
            if (!ScreenshotExtensions.Contains(extension))
                continue;

            var urlName = MediaUtils.GenerateUrlNameFromPath(file);
            screenshotUrlNames.Add(urlName);
        }

        return string.Join(",", screenshotUrlNames);
    }

    /// <summary>
    /// 处理电影目录，解析NFO并处理所有相关实体
    /// </summary>
    private async Task ProcessMovieDirectoryAsync(
        MediaHouseDbContext context,
        int libraryId,
        string libraryPath,
        string movieDirName,
        string movieDirPath,
        SystemSyncLog log)
    {
        _logger.LogInformation("Processing movie directory: {DirName}", movieDirName);

        var videoFile = FindVideoFile(movieDirPath);
        var nfoFile = FindNfoFile(movieDirPath);

        if (videoFile == null)
        {
            _logger.LogWarning("No video file found in {DirPath}", movieDirPath);
            return;
        }

        // 解析 NFO 文件
        var parseResult = nfoFile != null ? await _metadataService.ParseNfoFileFullAsync(nfoFile) : null;

        // 使用解析结果中的 Num 作为唯一标识符，如果没有则使用目录名
        var movieIdentifier = parseResult?.Num ?? movieDirName;

        // 处理所有相关实体
        await ProcessMediaItemAsync(context, libraryId, movieDirName, movieDirPath, movieIdentifier, parseResult, log);
    }

    /// <summary>
    /// 处理媒体项目及其所有相关实体（使用数据库事务确保原子性）
    /// </summary>
    /// <param name="libraryId">媒体库ID</param>
    /// <param name="libraryPath">媒体库路径</param>
    /// <param name="movieDirName">电影目录名</param>
    /// <param name="movieDirPath">电影目录完整路径</param>
    /// <param name="movieIdentifier">电影唯一标识符</param>
    /// <param name="parseResult">NFO解析结果</param>
    /// <param name="log">扫描日志（可为null）</param>
    /// <returns>MediaScanResult 包含所有处理的实体</returns>
    private async Task<MediaScanResult> ProcessMediaItemAsync(
        MediaHouseDbContext context,
        int libraryId,
        string movieDirName,
        string movieDirPath,
        string movieIdentifier,
        NfoParseResult? parseResult,
        SystemSyncLog? log)
    {
        // 预先生成图片 url_name 映射（格式：uuid前7位 + "_" + 图片后缀）
        var imageUrlNames = GenerateImageUrlNames(movieDirPath, parseResult);

        // 处理 extrafanart 子目录中的截图
        var extrafanartDir = FindExtrafanartDirectory(movieDirPath);
        var screenshotPaths = new List<string>();
        string screenshotsPath = string.Empty;
        if (extrafanartDir != null)
        {
            screenshotsPath = ProcessScreenshots(extrafanartDir);
            if (!string.IsNullOrEmpty(screenshotsPath))
            {
                screenshotPaths = [.. Directory.GetFiles(extrafanartDir).Where(f => ScreenshotExtensions.Contains(Path.GetExtension(f).ToLower()))];
            }
        }

        // 使用数据库事务确保所有操作的原子性
        await using var transaction = await context.Database.BeginTransactionAsync();

        try
        {
            // 1. 创建或更新 MediaItem (medias 表)
            var mediaItem = await UpsertMediaItemAsync(context, libraryId, movieIdentifier, movieDirName, parseResult, imageUrlNames, log);

            // 2. 创建或更新 Movie 并关联到 MediaItem (movies 表)
            //    新增/更新计数只在 UpsertMediaItemAsync 里加一次，这里不再重复计数（否则一部片算两次）
            var movie = await UpsertMovieAsync(context, libraryId, mediaItem.Id, movieIdentifier, parseResult, screenshotsPath);

            // 3. 创建或更新 MediaFile (media_files 表) - 关联到 MediaItem.Id
            var mediaFile = await UpsertMediaFileAsync(context, movieDirPath, mediaItem.Id, parseResult);

            // 4. 创建或更新 MediaImgs (media_imgs 表) - 关联到 MediaItem.Id
            var mediaImages = await UpsertMediaImagesAsync(context, movieDirName, movieDirPath, mediaItem.Id, parseResult, imageUrlNames, screenshotPaths);

            // 5. 标签关系以 NFO 为准：先清空再按 NFO 重建。
            //    只加不删的话，改过 NFO 的影片会继续挂着旧标签 —— 标签页计数虚高，
            //    点进去还能看到已经不属于这个标签的影片。
            if (parseResult?.Tags != null)
            {
                await context.MediaTags
                    .Where(mt => mt.MediaId == mediaItem.Id)
                    .ExecuteDeleteAsync();

                await UpsertMediaTagsAsync(context, libraryId, mediaItem.Id, parseResult.Tags);
            }

            // 6. 演员关系同理：NFO 里没有的人不该继续挂着
            if (parseResult?.Actors != null)
            {
                await context.MediaStaffs
                    .Where(ms => ms.MediaId == mediaItem.Id)
                    .ExecuteDeleteAsync();

                await UpsertMediaStaffAsync(context, mediaItem.Id, parseResult.Actors);
            }

            // 提事务
            await transaction.CommitAsync();

            return new MediaScanResult
            {
                Media = mediaItem,
                Movie = movie,
                MediaFile = mediaFile,
                MediaImages = mediaImages,
                Tags = parseResult?.Tags,
                Actors = parseResult?.Actors
            };
        }
        catch
        {
            // 回滚事务
            await transaction.RollbackAsync();
            throw;
        }
    }

    /// <summary>
    /// 生成图片 url_name 映射
    /// 格式：{hash}.{extension}
    /// </summary>
    private Dictionary<string, string> GenerateImageUrlNames(string movieDirPath, NfoParseResult? parseResult)
    {
        var imageUrlNames = new Dictionary<string, string>();

        if (parseResult?.ImagePaths == null)
            return imageUrlNames;

        var imageTypes = new[] { "poster", "thumb", "fanart" };

        foreach (var imageType in imageTypes)
        {
            if (!parseResult.ImagePaths.TryGetValue(imageType, out var imagePath) || string.IsNullOrEmpty(imagePath))
                continue;

            var fullPath = Path.Combine(movieDirPath, imagePath);
            if (!File.Exists(fullPath))
                continue;

            var urlName = MediaUtils.GenerateUrlNameFromPath(fullPath);
            imageUrlNames[imageType] = urlName;
        }

        return imageUrlNames;
    }

    /// <summary>
    /// 创建或更新 MediaItem 实体
    /// </param>
    private async Task<Media> UpsertMediaItemAsync(
        MediaHouseDbContext context,
        int libraryId,
        string movieIdentifier,
        string movieDirName,
        NfoParseResult? parseResult,
        Dictionary<string, string> imageUrlNames,
        SystemSyncLog? log)
    {
        var existingItem = await context.Medias
            .FirstOrDefaultAsync(m => m.LibraryId == libraryId && m.Name == movieIdentifier);

        Media mediaItem;
        if (existingItem == null)
        {
            _logger.LogInformation("Creating new media item: {Identifier}", movieIdentifier);
            mediaItem = new Media
            {
                LibraryId = libraryId,
                Name = movieIdentifier,
                Title = parseResult?.Title ?? movieIdentifier,
                OriginalTitle = parseResult?.Title ?? movieIdentifier,
                Type = "movie",
                ReleaseDate = parseResult?.Premiered,
                Summary = parseResult?.Summary,
                PosterPath = imageUrlNames.GetValueOrDefault("poster"),
                ThumbPath = imageUrlNames.GetValueOrDefault("thumb"),
                FanartPath = imageUrlNames.GetValueOrDefault("fanart"),
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };
            context.Medias.Add(mediaItem);
            if (log != null) log.AddedCount++;
        }
        else
        {
            _logger.LogInformation("Updating existing media item: {Identifier}", movieIdentifier);
            UpdateMediaItemFields(existingItem, parseResult, imageUrlNames);
            existingItem.UpdateTime = DateTime.UtcNow;
            mediaItem = existingItem;
            if (log != null) log.UpdatedCount++;
        }

        await context.SaveChangesAsync();
        return mediaItem;
    }

    /// <summary>
    /// 更新 MediaItem 字段（仅更新非空字段）
    /// </summary>
    private void UpdateMediaItemFields(Media mediaItem, NfoParseResult? parseResult, Dictionary<string, string> imageUrlNames)
    {
        if (parseResult == null) return;

        if (!string.IsNullOrEmpty(parseResult.Title))
        {
            mediaItem.Title = parseResult.Title;
            mediaItem.OriginalTitle = parseResult.Title;
        }

        if (!string.IsNullOrEmpty(parseResult.Premiered))
        {
            mediaItem.ReleaseDate = parseResult.Premiered;
        }

        if (!string.IsNullOrEmpty(parseResult.Summary))
        {
            mediaItem.Summary = parseResult.Summary;
        }

        // 更新图片路径（使用 url_name）
        if (parseResult.ImagePaths != null)
        {
            if (parseResult.ImagePaths.TryGetValue("poster", out var poster) && !string.IsNullOrEmpty(poster) && imageUrlNames.ContainsKey("poster"))
                mediaItem.PosterPath = imageUrlNames["poster"];

            if (parseResult.ImagePaths.TryGetValue("thumb", out var thumb) && !string.IsNullOrEmpty(thumb) && imageUrlNames.ContainsKey("thumb"))
                mediaItem.ThumbPath = imageUrlNames["thumb"];

            if (parseResult.ImagePaths.TryGetValue("fanart", out var fanart) && !string.IsNullOrEmpty(fanart) && imageUrlNames.ContainsKey("fanart"))
                mediaItem.FanartPath = imageUrlNames["fanart"];
        }
    }

    /// <summary>
    /// 创建或更新 Movie 实体并与 MediaItem 关联
    /// </summary>
    private async Task<Movie> UpsertMovieAsync(
        MediaHouseDbContext context,
        int libraryId,
        int mediaItemId,
        string movieIdentifier,
        NfoParseResult? parseResult,
        string? screenshotsPath)
    {        // 注意：必须带 LibraryId 过滤。只按 Num 找会把别的媒体库里的同番号影片“抢”过来，
        // 两个库有同一部片时，后扫描的库会直接把前一个库的记录改挂到自己身上。
        var existingMovie = await context.Movies
            .FirstOrDefaultAsync(m => m.Num == movieIdentifier && m.LibraryId == libraryId);

        Movie movie;
        if (existingMovie == null)
        {
            _logger.LogInformation("Creating new movie: {Identifier}", movieIdentifier);
            movie = new Movie
            {
                LibraryId = libraryId,
                MediaId = mediaItemId,  // 关联到 Media
                Num = parseResult?.Num ?? movieIdentifier,
                Studio = parseResult?.Studios,
                Maker = parseResult?.Maker,
                Runtime = parseResult?.Runtime,
                Description = parseResult?.Summary,
                ScreenshotsPath = screenshotsPath,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };
            context.Movies.Add(movie);
        }
        else
        {
            _logger.LogInformation("Updating existing movie: {Identifier}", movieIdentifier);
            UpdateMovieFields(existingMovie, parseResult, screenshotsPath);
            // 确保关联到正确的 Media
            if (existingMovie.MediaId != mediaItemId)
            {
                existingMovie.MediaId = mediaItemId;
            }
            existingMovie.UpdateTime = DateTime.UtcNow;
            movie = existingMovie;
        }

        await context.SaveChangesAsync();
        return movie;
    }

    /// <summary>
    /// 更新 Movie 字段（仅更新非空字段）
    /// </summary>
    private void UpdateMovieFields(Movie movie, NfoParseResult? parseResult, string? screenshotsPath)
    {
        if (parseResult == null) return;

        if (!string.IsNullOrEmpty(parseResult.Studios))
            movie.Studio = parseResult.Studios;

        if (!string.IsNullOrEmpty(parseResult.Maker))
            movie.Maker = parseResult.Maker;

        if (parseResult.Runtime.HasValue)
            movie.Runtime = parseResult.Runtime.Value;

        if (!string.IsNullOrEmpty(parseResult.Summary))
            movie.Description = parseResult.Summary;

        movie.ScreenshotsPath = screenshotsPath;
    }

    /// <summary>
    /// 创建或更新视频文件 MediaFile 记录
    /// 表: media_files
    /// 唯一标识: path (文件完整路径)
    /// </summary>
    /// <param name="context">数据库上下文</param>
    /// <param name="movieDirPath">电影目录路径</param>
    /// <param name="mediaItemId">MediaItem.ID (media_files.media_id)</param>
    /// <param name="parseResult">NFO解析结果</param>
    /// <returns>MediaFile 实体</returns>
    private async Task<MediaFile?> UpsertMediaFileAsync(
        MediaHouseDbContext context,
        string movieDirPath,
        int mediaItemId,
        NfoParseResult? parseResult)
    {
        var videoFile = FindVideoFile(movieDirPath);
        if (videoFile == null)
        {
            _logger.LogWarning("No video file found in {DirPath}", movieDirPath);
            return null;
        }

        var existingFile = await context.MediaFiles
            .FirstOrDefaultAsync(mf => mf.Path == videoFile);

        if (existingFile == null)
        {
            // 不存在，创建新记录
            _logger.LogInformation("Creating media file: {FilePath}", videoFile);
            var fileInfo = new FileInfo(videoFile);

            var mediaFile = new MediaFile
            {
                MediaId = mediaItemId,  // 关联到 MediaItem.Id
                Path = videoFile,
                FileName = fileInfo.Name,
                Extension = fileInfo.Extension.TrimStart('.'),
                Container = fileInfo.Extension.TrimStart('.'),
                SizeBytes = fileInfo.Length,
                // TODO: 使用 MediaInfo 提取视频元数据
                // VideoCodec, AudioCodec, Width, Height, Runtime
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };

            context.MediaFiles.Add(mediaFile);
            await RemoveStaleMediaFilesAsync(context, mediaItemId, videoFile);
            return mediaFile;
        }
        else
        {
            // 已存在，检查是否需要更新
            var fileInfo = new FileInfo(videoFile);
            var needsUpdate = false;

            if (existingFile.SizeBytes != fileInfo.Length)
            {
                existingFile.SizeBytes = fileInfo.Length;
                needsUpdate = true;
            }

            // 确保 MediaId 正确关联
            if (existingFile.MediaId != mediaItemId)
            {
                existingFile.MediaId = mediaItemId;
                needsUpdate = true;
            }

            if (needsUpdate)
            {
                existingFile.UpdateTime = DateTime.UtcNow;
                context.MediaFiles.Update(existingFile);
            }
            await RemoveStaleMediaFilesAsync(context, mediaItemId, videoFile);
            return existingFile;
        }
    }

    /// <summary>
    /// 创建或更新图片资源 MediaImgs 记录
    /// 表: media_imgs
    /// 唯一标识: path (图片文件完整路径)
    /// </summary>
    /// <param name="context">数据库上下文</param>
    /// <param name="movieDirName">电影目录名</param>
    /// <param name="movieDirPath">电影目录路径</param>
    /// <param name="mediaItemId">MediaItem.ID (media_imgs.media_id)</param>
    /// <param name="parseResult">NFO解析结果</param>
    /// <param name="imageUrlNames">预先生成的 url_name 映射</param>
    /// <param name="screenshotPaths">截图文件路径列表</param>
    /// <returns>处理过的 MediaImgs 列表</returns>
    private async Task<List<MediaImgs>> UpsertMediaImagesAsync(
        MediaHouseDbContext context,
        string movieDirName,
        string movieDirPath,
        int mediaItemId,
        NfoParseResult? parseResult,
        Dictionary<string, string> imageUrlNames,
        List<string>? screenshotPaths)
    {
        var result = new List<MediaImgs>();

        if (parseResult?.ImagePaths == null)
            return result;

        // 支要的图片类型：poster, thumb, fanart
        var imageTypes = new[] { "poster", "thumb", "fanart" };

        foreach (var imageType in imageTypes)
        {
            if (!parseResult.ImagePaths.TryGetValue(imageType, out var imagePath) || string.IsNullOrEmpty(imagePath))
                continue;

            var fullPath = Path.Combine(movieDirPath, imagePath);
            if (!File.Exists(fullPath))
            {
                _logger.LogWarning("Image file not found: {FilePath}", fullPath);
                continue;
            }

            var fileInfo = new FileInfo(fullPath);

            // 检查是否已存在（通过路径）
            var existingImage = await context.MediaImgs
                .FirstOrDefaultAsync(mi => mi.Path == fullPath);

            if (existingImage == null)
            {
                // 不存在，创建新记录
                _logger.LogInformation("Creating media image: {Type} - {FilePath}", imageType, fullPath);

                var mediaImg = new MediaImgs
                {
                    MediaId = mediaItemId,  // 关联到 MediaItem.Id
                    UrlName = imageUrlNames[imageType],  // 使用预先生成的 url_name
                    Name = fileInfo.Name,
                    Path = fullPath,
                    FileName = fileInfo.Name,
                    Extension = fileInfo.Extension.TrimStart('.'),
                    Type = imageType,  // "poster" / "thumb" / "fanart"
                    SizeBytes = fileInfo.Length,
                    CreateTime = DateTime.UtcNow,
                    UpdateTime = DateTime.UtcNow
                };

                context.MediaImgs.Add(mediaImg);
                result.Add(mediaImg);
            }
            else
            {
                // 已存在，检查是否需要更新
                var needsUpdate = false;

                // 更新文件大小信息（如果文件已更改）
                if (existingImage.SizeBytes != fileInfo.Length)
                {
                    existingImage.SizeBytes = fileInfo.Length;
                    needsUpdate = true;
                }

                // 确保 MediaId 正确关联
                if (existingImage.MediaId != mediaItemId)
                {
                    existingImage.MediaId = mediaItemId;
                    needsUpdate = true;
                }

                // 检查 url_name 是否需要更新
                var currentUrlName = imageUrlNames[imageType];
                if (existingImage.UrlName != currentUrlName)
                {
                    existingImage.UrlName = currentUrlName;
                    needsUpdate = true;
                }

                if (needsUpdate)
                {
                    existingImage.UpdateTime = DateTime.UtcNow;
                    context.MediaImgs.Update(existingImage);
                }
                result.Add(existingImage);
            }
        }

        // 处理截图文件
        if (screenshotPaths != null && screenshotPaths.Count > 0)
        {
            foreach (var screenshotPath in screenshotPaths)
            {
                var fileInfo = new FileInfo(screenshotPath);
                var urlName = MediaUtils.GenerateUrlNameFromPath(screenshotPath);

                // 检查是否已存在（通过路径）
                var existingImage = await context.MediaImgs
                    .FirstOrDefaultAsync(mi => mi.Path == screenshotPath);

                if (existingImage == null)
                {
                    // 不存在，创建新记录
                    _logger.LogInformation("Creating screenshot: {FilePath}", screenshotPath);

                    var mediaImg = new MediaImgs
                    {
                        MediaId = mediaItemId,
                        UrlName = urlName,
                        Name = fileInfo.Name,
                        Path = screenshotPath,
                        FileName = fileInfo.Name,
                        Extension = fileInfo.Extension.TrimStart('.'),
                        Type = "screenshot",
                        SizeBytes = fileInfo.Length,
                        CreateTime = DateTime.UtcNow,
                        UpdateTime = DateTime.UtcNow
                    };

                    context.MediaImgs.Add(mediaImg);
                    result.Add(mediaImg);
                }
                else
                {
                    // 已存在，检查是否需要更新
                    var needsUpdate = false;

                    if (existingImage.SizeBytes != fileInfo.Length)
                    {
                        existingImage.SizeBytes = fileInfo.Length;
                        needsUpdate = true;
                    }

                    if (existingImage.MediaId != mediaItemId)
                    {
                        existingImage.MediaId = mediaItemId;
                        needsUpdate = true;
                    }

                    if (existingImage.UrlName != urlName)
                    {
                        existingImage.UrlName = urlName;
                        needsUpdate = true;
                    }

                    if (needsUpdate)
                    {
                        existingImage.UpdateTime = DateTime.UtcNow;
                        context.MediaImgs.Update(existingImage);
                    }
                    result.Add(existingImage);
                }
            }
        }
        return result;
    }

    /// <summary>
    /// 创建或更新媒体标签关系
    /// 表: tags (查找或创建) + media_tags (创建关联)
    /// media_tags 组合主键: lib_id + media_id + tag_id
    /// </summary>
    /// <param name="context">数据库上下文</param>
    /// <param name="libraryId">媒体库ID</param>
    /// <param name="mediaItemId">MediaItem.ID (media_tags.media_id)</param>
    /// <param name="tagsString">标签字符串，逗号分隔</param>
    private async Task UpsertMediaTagsAsync(
        MediaHouseDbContext context,
        int libraryId,
        int mediaItemId,
        string tagsString)
    {
        var tagNames = tagsString.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var tagName in tagNames.Distinct())
        {
            if (string.IsNullOrWhiteSpace(tagName))
                continue;

            var trimmedTagName = tagName.Trim();

            // 1. 获取或创建 Tag 实体 (tags 表)
            var tag = await GetOrCreateTagAsync(context, trimmedTagName);

            // 2. 检查 MediaTag 关联是否已存在 (media_tags 表)
            var existingMediaTag = await context.MediaTags
                .FirstOrDefaultAsync(mt => mt.MediaLibraryId == libraryId
                    && mt.MediaType == "movie"
                    && mt.MediaId == mediaItemId
                    && mt.TagId == tag.Id);

            if (existingMediaTag == null)
            {
                // 3. 创建新的 MediaTag 关联
                var mediaTag = new MediaTag
                {
                    MediaLibraryId = libraryId,
                    MediaType = "movie",
                    MediaId = mediaItemId,  // 关联到 MediaItem.Id
                    TagId = tag.Id,
                    CreateTime = DateTime.UtcNow
                };

                context.MediaTags.Add(mediaTag);
            }
        }
    }

    /// <summary>
    /// 获取或创建 Tag 实体
    /// 表: tags
    /// 唯一标识: tag_name
    /// </summary>
    /// <param name="context">数据库上下文</param>
    /// <param name="tagName">标签名称</param>
    /// <returns>Tag 实体</returns>
    private async Task<Tag> GetOrCreateTagAsync(MediaHouseDbContext context, string tagName)
    {
        var tag = await context.Tags
            .FirstOrDefaultAsync(t => t.TagName == tagName);

        if (tag == null)
        {
            _logger.LogInformation("Creating new tag: {TagName}", tagName);
            tag = new Tag
            {
                TagName = tagName,
                CreateTime = DateTime.UtcNow
            };
            context.Tags.Add(tag);
            await context.SaveChangesAsync();
        }

        return tag;
    }

    /// <summary>
    /// 创建或更新媒体人员（演员）关系
    /// 表: staff (查找或创建) + media_staff (创建关联)
    /// </summary>
    /// <param name="context">数据库上下文</param>
    /// <param name="mediaItemId">MediaItem.ID (media_staff.media_id)</param>
    /// <param name="actorNames">演员名称列表</param>
    private async Task UpsertMediaStaffAsync(
        MediaHouseDbContext context,
        int mediaItemId,
        List<string> actorNames)
    {
        for (int sortOrder = 0; sortOrder < actorNames.Count; sortOrder++)
        {
            var actorName = actorNames[sortOrder];
            if (string.IsNullOrWhiteSpace(actorName))
                continue;

            var trimmedName = actorName.Trim();

            // 1. 获取或创建 Staff 实体 (staff 表)
            var staff = await GetOrCreateStaffAsync(context, trimmedName);

            // 2. 检查 MediaStaff 关联是否已存在 (media_staff 表)
            var existingMediaStaff = await context.MediaStaffs
                .FirstOrDefaultAsync(ms => ms.MediaType == "movie"
                    && ms.MediaId == mediaItemId
                    && ms.StaffId == staff.Id
                    && ms.RoleType == "actor");

            if (existingMediaStaff == null)
            {
                // 3. 创建新的 MediaStaff 关联
                var mediaStaff = new MediaStaff
                {
                    MediaType = "movie",
                    MediaId = mediaItemId,  // 关联到 MediaItem.Id
                    StaffId = staff.Id,
                    RoleType = "actor",
                    RoleName = null,
                    SortOrder = sortOrder,
                    CreateTime = DateTime.UtcNow,
                    UpdateTime = DateTime.UtcNow
                };

                context.MediaStaffs.Add(mediaStaff);
            }
            else
            {
                // 更新排序顺序
                if (existingMediaStaff.SortOrder != sortOrder)
                {
                    existingMediaStaff.SortOrder = sortOrder;
                    existingMediaStaff.UpdateTime = DateTime.UtcNow;
                    context.MediaStaffs.Update(existingMediaStaff);
                }
            }
        }
    }

    /// <summary>
    /// 获取或创建 Staff 实体
    /// 表: staff
    /// 唯一标识: name
    /// </summary>
    /// <param name="context">数据库上下文</param>
    /// <param name="staffName">人员名称</param>
    /// <returns>Staff 实体</returns>
    private async Task<Staff> GetOrCreateStaffAsync(MediaHouseDbContext context, string staffName)
    {
        var staff = await context.Staffs
            .FirstOrDefaultAsync(s => s.Name == staffName);

        if (staff == null)
        {
            _logger.LogInformation("Creating new staff: {StaffName}", staffName);
            staff = new Staff
            {
                Name = staffName,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };
            context.Staffs.Add(staff);
            await context.SaveChangesAsync();
        }

        return staff;
    }

    /// <summary>
    /// 路径比较器：Windows 文件系统不区分大小写，Linux 区分。
    /// </summary>
    private static StringComparer PathComparer =>
        OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;

    /// <summary>
    /// 归一化目录路径，用于比对（去掉末尾分隔符、解析相对路径）。
    /// </summary>
    private static string? NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;

        try
        {
            return Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// 判断该媒体是否还有“目录在扫描范围里、且文件真实存在”的视频。
    /// 只看目录是不够的：用户可能只删了 mp4 而留下了 nfo/封面，那种记录也该清掉。
    /// </summary>
    private static bool IsDirectoryStillPresent(Media media, HashSet<string> scannedDirs)
    {
        if (media.MediaFiles.Count == 0) return false;

        foreach (var file in media.MediaFiles)
        {
            var dir = NormalizePath(Path.GetDirectoryName(file.Path));
            if (dir == null || !scannedDirs.Contains(dir)) continue;
            if (File.Exists(file.Path)) return true;
        }

        return false;
    }

    /// <summary>
    /// 删除磁盘上已经不存在的媒体记录。
    /// 必须在遍历完所有目录之后调用，否则会把还没扫到的目录误判成“已删除”。
    /// </summary>
    private async Task<int> PruneMissingMediaAsync(
        MediaHouseDbContext context,
        int libraryId,
        List<string[]> existingMovieDirs,
        SystemSyncLog log)
    {
        if (!_scanOptions.DeleteMissingMedia) return 0;

        // 一个目录都没枚举到，通常是挂载点掉线或者路径配错了，这时候绝不能按“全都不存在”清库
        if (existingMovieDirs.Count == 0)
        {
            _logger.LogWarning(
                "跳过清理：媒体库 {LibraryId} 没有枚举到任何电影目录，可能是存储不可用", libraryId);
            return 0;
        }

        try
        {
            var scannedDirs = new HashSet<string>(PathComparer);
            foreach (var dir in existingMovieDirs)
            {
                var normalized = NormalizePath(dir[1]);
                if (normalized != null) scannedDirs.Add(normalized);
            }

            var medias = await context.Medias
                .Where(m => m.LibraryId == libraryId && m.Type == "movie")
                .Include(m => m.MediaFiles)
                .ToListAsync();

            if (medias.Count == 0) return 0;

            var missing = medias.Where(m => !IsDirectoryStillPresent(m, scannedDirs)).ToList();
            if (missing.Count == 0) return 0;

            // 一次要删掉大半个库，多半是存储出了问题，这次先不删
            if (medias.Count >= 5 &&
                _scanOptions.PruneSafetyRatio > 0 &&
                _scanOptions.PruneSafetyRatio < 1 &&
                missing.Count > medias.Count * _scanOptions.PruneSafetyRatio)
            {
                _logger.LogError(
                    "跳过清理：媒体库 {LibraryId} 有 {Missing}/{Total} 条记录找不到目录，超过安全阈值 {Ratio:P0}。" +
                    "请确认存储挂载正常；确实要清理就把 Scan:PruneSafetyRatio 调到 1",
                    libraryId, missing.Count, medias.Count, _scanOptions.PruneSafetyRatio);
                return 0;
            }

            var missingIds = missing.Select(m => m.Id).ToList();

            // media_tags / media_staffs 与 medias 的级联只靠 EF 约定推断，显式删一遍更保险
            await context.MediaTags.Where(mt => missingIds.Contains(mt.MediaId)).ExecuteDeleteAsync();
            await context.MediaStaffs.Where(ms => missingIds.Contains(ms.MediaId)).ExecuteDeleteAsync();

            // play_records / my_favors 在 MediaId 上没有外键，删除 Media 不会级联，
            // 不手动清就会留下“幽灵记录”——首页的最近播放/收藏还能看到已经不存在的片子。
            var removedPlayRecords = await context.PlayRecords
                .Where(p => missingIds.Contains(p.MediaId))
                .ExecuteDeleteAsync();
            var removedFavors = await context.MyFavors
                .Where(f => missingIds.Contains(f.MediaId))
                .ExecuteDeleteAsync();

            context.Medias.RemoveRange(missing);
            await context.SaveChangesAsync();

            log.DeletedCount = (log.DeletedCount ?? 0) + missing.Count;

            _logger.LogInformation(
                "清理媒体库 {LibraryId}: 媒体 {MediaCount} 条、播放记录 {PlayCount} 条、收藏 {FavorCount} 条",
                libraryId, missing.Count, removedPlayRecords, removedFavors);

            return missing.Count;
        }
        catch (Exception ex)
        {
            // 清理失败不影响本次扫描结果，记录下来下次再说
            _logger.LogError(ex, "清理媒体库 {LibraryId} 的失效媒体时出错", libraryId);
            return 0;
        }
    }

    /// <summary>
    /// 清理同一个媒体下指向已不存在文件的旧记录（视频改名 / 换片留下的残留）。
    /// 不清理的话，播放接口可能挑到那条失效路径，出现“文件明明在却播不了”。
    /// </summary>
    private static async Task RemoveStaleMediaFilesAsync(
        MediaHouseDbContext context,
        int mediaItemId,
        string currentVideoPath)
    {
        var others = await context.MediaFiles
            .Where(mf => mf.MediaId == mediaItemId && mf.Path != currentVideoPath)
            .ToListAsync();

        foreach (var stale in others)
        {
            if (!File.Exists(stale.Path))
            {
                context.MediaFiles.Remove(stale);
            }
        }
    }

    /// <summary>
    /// 扫描单个电影目录并返回元数据
    /// </summary>
    /// <param name="libraryId">媒体库ID</param>
    /// <param name="movieDirName">电影目录名</param>
    /// <param name="movieDirPath">电影目录完整路径</param>
    /// <returns>MediaScanResult 包含所有处理的实体</returns>
    public async Task<MediaScanResult> ScanSingleMovieAsync(int libraryId, string movieDirName, string movieDirPath)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        var library = await context.MediaLibraries.FindAsync(libraryId) ??
            throw new InvalidOperationException($"Library {libraryId} not found");

        _logger.LogInformation("Scanning single movie directory: {DirName}", movieDirName);

        var videoFile = FindVideoFile(movieDirPath);
        var nfoFile = FindNfoFile(movieDirPath);

        if (videoFile == null)
        {
            _logger.LogWarning("No video file found in {DirPath}", movieDirPath);
            throw new InvalidOperationException($"No video file found in {movieDirPath}");
        }

        // 解析 NFO 文件
        var parseResult = nfoFile != null ? await _metadataService.ParseNfoFileFullAsync(nfoFile) : null;

        // 使用解析结果中的 Num 作为唯一标识符，如果没有则使用目录名
        var movieIdentifier = parseResult?.Num ?? movieDirName;

        // 处理所有相关实体并返回结果
        return await ProcessMediaItemAsync(context, libraryId, movieDirName, movieDirPath, movieIdentifier, parseResult, null);
    }
}
