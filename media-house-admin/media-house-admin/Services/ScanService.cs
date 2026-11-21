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
            // 必须显式置 0：这几个字段是 int?，null 上做 ++ 仍然是 null，计数会一直是空
            AddedCount = 0,
            UpdatedCount = 0,
            DeletedCount = 0,
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
            // 同 StartFullScanAsync：int? 上做 ++ 不会从 null 变成数字
            AddedCount = 0,
            UpdatedCount = 0,
            DeletedCount = 0,
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

    private Task ExecuteFullScanAsync(int libraryId, string libraryPath) =>
        ExecuteScanAsync(libraryId, libraryPath, SyncType.FullScan, skipAlreadyScanned: false);

    /// <summary>
    /// 全量扫描和增量扫描的公共实现。两者唯一的差别是增量只重新处理「还没入库」的目录，
    /// 其余流程（遍历、落库、清理磁盘上已不存在的媒体）完全一致。
    /// </summary>
    private async Task ExecuteScanAsync(int libraryId, string libraryPath, SyncType syncType, bool skipAlreadyScanned)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        try
        {
            var log = await context.SystemSyncLogs
                .Where(sl => sl.MediaLibraryId == libraryId && sl.SyncType == syncType && sl.Status == SyncStatus.Started)
                .OrderByDescending(sl => sl.StartTime)
                .FirstOrDefaultAsync();

            if (log == null)
            {
                _logger.LogWarning("No pending {SyncType} log found for library {LibraryId}", syncType, libraryId);
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

            _logger.LogInformation("Starting {SyncType} for library {LibraryId} at {Path}", syncType, libraryId, libraryPath);

            var movieDirectories = GetMovieDirectories(libraryPath);
            _logger.LogInformation("Found {Count} movie directories in {Path}", movieDirectories.Count, libraryPath);

            var directoriesToProcess = skipAlreadyScanned
                ? await FilterAlreadyScannedDirectoriesAsync(context, libraryId, movieDirectories)
                : movieDirectories;

            if (skipAlreadyScanned)
            {
                _logger.LogInformation("Incremental scan: {New} new directories out of {Total}",
                    directoriesToProcess.Count, movieDirectories.Count);
            }

            // 整次扫描共用一份标签/演员缓存，避免每部影片都去查一遍 tags / staffs（N+1）
            var lookup = await ScanLookupCache.CreateAsync(context);

            foreach (var movieDir in directoriesToProcess)
            {
                try
                {
                    await ProcessMovieDirectoryAsync(context, libraryId, movieDir, log, lookup);
                    await context.SaveChangesAsync();
                }
                catch (DbUpdateException ex)
                {
                    // 单部影片的数据冲突不该让整次扫描失败：记录下来、清干净、继续下一个
                    _logger.LogError(ex, "写入影片失败，跳过该目录：{Directory}", movieDir.Name);

                    context.ChangeTracker.Clear();
                    log = await context.SystemSyncLogs.FindAsync(log.Id) ?? log;
                }
            }

            // 清理磁盘上已经不存在的媒体（这一步必须在遍历完所有目录之后做）
            var deletedCount = await PruneMissingMediaAsync(context, libraryId, movieDirectories, log);

            log.Status = SyncStatus.Completed;
            log.EndTime = DateTime.UtcNow;

            // 上面的 ChangeTracker.Clear() 会把 library 也一起脱离跟踪，
            // 所以这里重新查一次再改状态，避免状态没写进去
            var libraryToUpdate = await context.MediaLibraries.FindAsync(libraryId);
            if (libraryToUpdate != null)
            {
                libraryToUpdate.Status = ScanStatus.Idle;
                libraryToUpdate.UpdateTime = DateTime.UtcNow;
            }

            await context.SaveChangesAsync();
            _logger.LogInformation(
                "{SyncType} completed for library {LibraryId}. Added: {Added}, Updated: {Updated}, Deleted: {Deleted}",
                syncType, libraryId, log.AddedCount, log.UpdatedCount, deletedCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "{SyncType} failed for library {LibraryId}", syncType, libraryId);

            try
            {
                // 关键：先把跟踪状态清掉再写状态。
                // 事务回滚不会重置 EF 的跟踪器，残留的 Added 实体一旦被后面的
                // SaveChanges 冲出去，就会变成「主键重复」——把真正的错误盖掉。
                context.ChangeTracker.Clear();

                var log = await context.SystemSyncLogs
                    .Where(sl => sl.MediaLibraryId == libraryId && sl.SyncType == syncType &&
                                 (sl.Status == SyncStatus.Started || sl.Status == SyncStatus.InProgress))
                    .OrderByDescending(sl => sl.StartTime)
                    .FirstOrDefaultAsync();

                if (log != null)
                {
                    log.Status = SyncStatus.Failed;
                    log.ErrorMessage = ex.Message;
                    log.EndTime = DateTime.UtcNow;
                }

                var library = await context.MediaLibraries.FindAsync(libraryId);
                if (library != null)
                {
                    library.Status = ScanStatus.Error;
                    library.UpdateTime = DateTime.UtcNow;
                }

                await context.SaveChangesAsync();
            }
            catch (Exception statusEx)
            {
                // 连状态都写不进去也不能再抛，否则原始错误会被覆盖
                _logger.LogError(statusEx, "记录扫描失败状态时出错");
            }
        }
    }

    /// <summary>
    /// 增量扫描用：筛掉「已经入库、且视频文件仍然存在」的目录。
    /// 必须按磁盘目录比对，不能拿 Media.Name 比目录名 —— Name 存的是 NFO 里的 Num，
    /// 和目录名经常不一致，会让同一个目录每次都被当成新目录重复处理。
    /// </summary>
    private async Task<List<MovieDirectory>> FilterAlreadyScannedDirectoriesAsync(
        MediaHouseDbContext context,
        int libraryId,
        List<MovieDirectory> movieDirectories)
    {
        var existingFilePaths = await context.MediaFiles
            .Where(mf => mf.Media != null && mf.Media.LibraryId == libraryId)
            .Select(mf => mf.Path)
            .ToListAsync();

        var scannedDirs = new HashSet<string>(PathComparer);
        foreach (var path in existingFilePaths)
        {
            var dir = NormalizePath(Path.GetDirectoryName(path));
            if (dir == null) continue;

            // 文件已经不在磁盘上（改名/换片），这个目录要重新处理，
            // 否则旧路径会一直留在库里，表现为「文件明明在但播放 404」。
            if (!File.Exists(path)) continue;

            scannedDirs.Add(dir);
        }

        return movieDirectories
            .Where(dir => NormalizePath(dir.FullPath) is not { } normalized || !scannedDirs.Contains(normalized))
            .ToList();
    }

    private Task ExecuteIncrementalScanAsync(int libraryId, string libraryPath) =>
        ExecuteScanAsync(libraryId, libraryPath, SyncType.IncrementalScan, skipAlreadyScanned: true);

    /// <summary>
    /// 一个电影目录：名字、完整路径，以及目录下的文件列表。
    /// 文件列表在遍历时只读一次、随后一路传递复用，避免同一目录被反复枚举（NAS 上开销明显）。
    /// </summary>
    private sealed record MovieDirectory(string Name, string FullPath, string[] Files);

    /// <summary>
    /// 获取所有电影目录（递归扫描）
    /// </summary>
    private List<MovieDirectory> GetMovieDirectories(string libraryPath)
    {
        var movieDirs = new List<MovieDirectory>();

        if (!Directory.Exists(libraryPath))
        {
            _logger.LogWarning("Library path does not exist: {Path}", libraryPath);
            return movieDirs;
        }

        CollectMovieDirectories(libraryPath, movieDirs);
        return movieDirs;
    }

    private void CollectMovieDirectories(string directoryPath, List<MovieDirectory> result)
    {
        string[] subDirectories;
        try
        {
            subDirectories = Directory.GetDirectories(directoryPath);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            // NAS 上个别目录读不了很常见，跳过即可，不要让整次扫描失败
            _logger.LogWarning(ex, "跳过无法读取的目录: {Path}", directoryPath);
            return;
        }

        foreach (var dir in subDirectories)
        {
            string[] files;
            try
            {
                files = Directory.GetFiles(dir);
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                _logger.LogWarning(ex, "跳过无法读取的目录: {Path}", dir);
                continue;
            }

            if (HasVideoOrNfo(files))
            {
                // 找到电影目录，加入结果，不再递归它的子目录
                result.Add(new MovieDirectory(Path.GetFileName(dir), dir, files));
            }
            else
            {
                CollectMovieDirectories(dir, result);
            }
        }
    }

    /// <summary>
    /// 判断目录下是否有视频文件或 NFO 文件（有其一即视为电影目录）
    /// </summary>
    private static bool HasVideoOrNfo(string[] files)
    {
        foreach (var file in files)
        {
            if (VideoExtensions.Contains(Path.GetExtension(file).ToLower())) return true;
            if (file.EndsWith(".nfo", StringComparison.OrdinalIgnoreCase)) return true;
        }

        return false;
    }

    /// <summary>
    /// 查找视频文件
    /// </summary>
    private static string? FindVideoFile(string[] files) =>
        files.FirstOrDefault(f => VideoExtensions.Contains(Path.GetExtension(f).ToLower()));

    /// <summary>
    /// 查找NFO文件
    /// </summary>
    private static string? FindNfoFile(string[] files) =>
        files.FirstOrDefault(f => f.EndsWith(".nfo", StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// 查找 extrafanart 子目录
    /// </summary>
    private string? FindExtrafanartDirectory(string movieDirPath)
    {
        var extrafanartPath = Path.Combine(movieDirPath, "extrafanart");
        return Directory.Exists(extrafanartPath) ? extrafanartPath : null;
    }

    /// <summary>
    /// 列出影片目录下的剧照（只枚举一次，url_name 交给调用方生成）。
    ///
    /// 正常情况在 extrafanart/ 子目录里；但旧版本的上传工具会把剧照摊平到影片目录根，
    /// 那种情况也认，否则用户只能重新上传才能找回剧照。
    /// </summary>
    private static List<string> GetScreenshotFiles(string movieDirPath)
    {
        var result = new List<string>();

        var extrafanartDir = Path.Combine(movieDirPath, "extrafanart");
        if (Directory.Exists(extrafanartDir))
        {
            result.AddRange(Directory.GetFiles(extrafanartDir)
                .Where(f => ScreenshotExtensions.Contains(Path.GetExtension(f).ToLower())));
        }

        // 兼容摊平到根目录的旧数据：extrafanart-1.jpg / screenshot-1.jpg 这类
        result.AddRange(Directory.GetFiles(movieDirPath)
            .Where(f => ScreenshotExtensions.Contains(Path.GetExtension(f).ToLower()))
            .Where(IsScreenshotFileName));

        return result;
    }

    /// <summary>文件名是否像剧照（extrafanart-1.jpg、screenshot_2.png 等）</summary>
    private static bool IsScreenshotFileName(string path)
    {
        var name = Path.GetFileNameWithoutExtension(path);
        return name.StartsWith("extrafanart", StringComparison.OrdinalIgnoreCase)
            || name.StartsWith("screenshot", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// 处理电影目录，解析NFO并处理所有相关实体
    /// </summary>
    private async Task<MediaScanResult?> ProcessMovieDirectoryAsync(
        MediaHouseDbContext context,
        int libraryId,
        MovieDirectory movieDir,
        SystemSyncLog? log,
        ScanLookupCache lookup)
    {
        _logger.LogInformation("Processing movie directory: {DirName}", movieDir.Name);

        // videoFile 是完整路径（files 里存的就是全路径）
        var videoFile = FindVideoFile(movieDir.Files);
        if (videoFile == null)
        {
            _logger.LogWarning("No video file found in {DirPath}", movieDir.FullPath);
            return null;
        }

        // 解析 NFO 文件
        var nfoFile = FindNfoFile(movieDir.Files);
        var parseResult = nfoFile != null ? await _metadataService.ParseNfoFileFullAsync(nfoFile) : null;

        // 番号只作为显示名；真正的身份是视频文件路径 —— 同一番号可以有多个目录（多版本）
        var movieIdentifier = parseResult?.Num ?? movieDir.Name;

        // 处理所有相关实体
        return await ProcessMediaItemAsync(context, libraryId, movieDir, videoFile, movieIdentifier, parseResult, log, lookup);
    }

    /// <summary>
    /// 处理媒体项目及其所有相关实体（使用数据库事务确保原子性）
    /// </summary>
    private async Task<MediaScanResult> ProcessMediaItemAsync(
        MediaHouseDbContext context,
        int libraryId,
        MovieDirectory movieDir,
        string videoFullPath,
        string movieIdentifier,
        NfoParseResult? parseResult,
        SystemSyncLog? log,
        ScanLookupCache lookup)
    {
        // 预先生成图片 url_name 映射（格式：uuid前7位 + "_" + 图片后缀）
        var imageUrlNames = GenerateImageUrlNames(movieDir.FullPath, parseResult);

        // 处理 extrafanart 子目录中的截图（只枚举一次，映射和入库共用同一份列表）
        var screenshotPaths = GetScreenshotFiles(movieDir.FullPath);
        var screenshotsPath = string.Join(",", screenshotPaths.Select(MediaUtils.GenerateUrlNameFromPath));

        // 使用数据库事务确保所有操作的原子性
        await using var transaction = await context.Database.BeginTransactionAsync();

        try
        {
            // 1. 创建或更新 MediaItem (medias 表)
            var mediaItem = await UpsertMediaItemAsync(context, libraryId, movieIdentifier, movieDir.Name, videoFullPath, parseResult, imageUrlNames, log);

            // 2. 创建或更新 Movie 并关联到 MediaItem (movies 表)
            //    新增/更新计数只在 UpsertMediaItemAsync 里加一次，这里不再重复计数（否则一部片算两次）
            var movie = await UpsertMovieAsync(context, libraryId, mediaItem.Id, movieIdentifier, parseResult, screenshotsPath);

            // 3. 创建或更新 MediaFile (media_files 表) - 关联到 MediaItem.Id
            var mediaFile = await UpsertMediaFileAsync(context, movieDir, mediaItem.Id);

            // 4. 创建或更新 MediaImgs (media_imgs 表) - 关联到 MediaItem.Id
            var mediaImages = await UpsertMediaImagesAsync(context, movieDir, mediaItem.Id, parseResult, imageUrlNames, screenshotPaths);

            // 5. 标签关系以 NFO 为准：先清空再按 NFO 重建。
            //    只加不删的话，改过 NFO 的影片会继续挂着旧标签 —— 标签页计数虚高，
            //    点进去还能看到已经不属于这个标签的影片。
            if (parseResult?.Tags != null)
            {
                await context.MediaTags
                    .Where(mt => mt.MediaId == mediaItem.Id)
                    .ExecuteDeleteAsync();

                DetachTrackedMediaTags(context, mediaItem.Id);

                await UpsertMediaTagsAsync(context, libraryId, mediaItem.Id, parseResult.Tags, lookup);
            }

            // 6. 演员关系同理：NFO 里没有的人不该继续挂着
            if (parseResult?.Actors != null)
            {
                await context.MediaStaffs
                    .Where(ms => ms.MediaId == mediaItem.Id)
                    .ExecuteDeleteAsync();

                DetachTrackedMediaStaffs(context, mediaItem.Id);

                await UpsertMediaStaffAsync(context, mediaItem.Id, parseResult.Actors, lookup);
            }

            // 标签/演员的删除和重建都在本事务内落库：
            // 之前它们只挂在跟踪器上，靠外层循环的 SaveChanges 冲出去，
            // 既不原子（删除在事务内、插入在事务外），失败时也容易和回滚状态混在一起
            await context.SaveChangesAsync();

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

            // 回滚只撤销数据库，不会撤销 EF 的跟踪状态。不清掉的话，
            // 后面任何一次 SaveChanges（比如外层记录扫描失败）都会把这次
            // 已经回滚的 INSERT 再冲一遍，表现为「主键重复」。
            context.ChangeTracker.Clear();

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
        string videoFullPath,
        NfoParseResult? parseResult,
        Dictionary<string, string> imageUrlNames,
        SystemSyncLog? log)
    {
        // 身份 = 视频文件路径（media_files.path 本身就有唯一索引）。
        // 这样同一个番号的多个目录会各自成为一条记录，正好承载「一部片多个版本」；
        // 用番号做身份的话它们会互相覆盖，只剩最后扫到的一份。
        var existingItem = await context.Medias
            .FirstOrDefaultAsync(m => m.LibraryId == libraryId
                && m.MediaFiles.Any(mf => mf.Path == videoFullPath));

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
    {        // 按 MediaId 找：同一番号可能有多个版本（多个目录），
        // 用 Num 做查找键会把不同版本互相覆盖。
        var existingMovie = await context.Movies
            .FirstOrDefaultAsync(m => m.MediaId == mediaItemId && m.LibraryId == libraryId);

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
    private async Task<MediaFile?> UpsertMediaFileAsync(
        MediaHouseDbContext context,
        MovieDirectory movieDir,
        int mediaItemId)
    {
        var videoFile = FindVideoFile(movieDir.Files);
        if (videoFile == null)
        {
            _logger.LogWarning("No video file found in {DirPath}", movieDir.FullPath);
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
    private async Task<List<MediaImgs>> UpsertMediaImagesAsync(
        MediaHouseDbContext context,
        MovieDirectory movieDir,
        int mediaItemId,
        NfoParseResult? parseResult,
        Dictionary<string, string> imageUrlNames,
        List<string>? screenshotPaths)
    {
        var result = new List<MediaImgs>();

        if (parseResult?.ImagePaths == null)
            return result;

        // 支持的图片类型：poster, thumb, fanart
        var imageTypes = new[] { "poster", "thumb", "fanart" };

        foreach (var imageType in imageTypes)
        {
            if (!parseResult.ImagePaths.TryGetValue(imageType, out var imagePath) || string.IsNullOrEmpty(imagePath))
                continue;

            var fullPath = Path.Combine(movieDir.FullPath, imagePath);
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

        // 清掉指向已不存在文件的旧图片记录（换封面、删截图后留下的残留）。
        // 不清理的话，图片接口会先查到记录、再因为文件不存在返回 404。
        var allImages = await context.MediaImgs
            .Where(mi => mi.MediaId == mediaItemId)
            .ToListAsync();

        foreach (var image in allImages)
        {
            if (!File.Exists(image.Path))
            {
                context.MediaImgs.Remove(image);
            }
        }

        return result;
    }

    /// <summary>
    /// 把跟踪器里属于这部影片的「标签关系」实体摘掉。
    ///
    /// ExecuteDeleteAsync 直接走 SQL 删除，跟踪器不会跟着清理。而同一部影片
    /// 在一次扫描里可能被处理两次——两个目录的 NFO 写了同一个番号就会这样
    /// （movieIdentifier 取的是 NFO 里的 Num）。第二次 Add 同一个主键时，
    /// 第一次留下的实体还挂在跟踪器里，就会抛身份冲突。
    ///
    /// 必须按类型分开摘：先处理标签、再处理演员，若演员那步把标签一起摘了，
    /// 刚加进去的标签关系就会丢失。
    /// </summary>
    private static void DetachTrackedMediaTags(MediaHouseDbContext context, int mediaItemId)
    {
        foreach (var entry in context.ChangeTracker.Entries<MediaTag>().ToList())
        {
            if (entry.Entity.MediaId == mediaItemId)
            {
                entry.State = EntityState.Detached;
            }
        }
    }

    private static void DetachTrackedMediaStaffs(MediaHouseDbContext context, int mediaItemId)
    {
        foreach (var entry in context.ChangeTracker.Entries<MediaStaff>().ToList())
        {
            if (entry.Entity.MediaId == mediaItemId)
            {
                entry.State = EntityState.Detached;
            }
        }
    }

    /// <summary>
    /// 重建媒体标签关系。
    /// 调用方（ProcessMediaItemAsync）已经清空过该媒体的旧关系，这里只负责按 NFO 重新插入。
    /// </summary>
    private async Task UpsertMediaTagsAsync(
        MediaHouseDbContext context,
        int libraryId,
        int mediaItemId,
        string tagsString,
        ScanLookupCache lookup)
    {
        var tagNames = tagsString
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            // 大小写不同也算同一个标签，省掉最明显的一类重复
            .Distinct(StringComparer.OrdinalIgnoreCase);

        // 按「解析出来的 TagId」再去一次重。
        // 名字写法不同（重音、组合字符、全角半角等）在库里可能是同一行，
        // 于是不同名字会拿到同一个 Tag；media_tags 的主键是
        // (library, media, tag)，再 Add 一次就会触发 EF 的跟踪冲突。
        var usedTagIds = new HashSet<int>();

        foreach (var tagName in tagNames)
        {
            if (string.IsNullOrWhiteSpace(tagName))
                continue;

            var tag = await GetOrCreateTagAsync(context, tagName, lookup);

            if (!usedTagIds.Add(tag.Id))
            {
                _logger.LogInformation(
                    "标签 {TagName} 与本次已处理的标签指向同一行（Id={TagId}），跳过重复关联",
                    tagName, tag.Id);
                continue;
            }

            context.MediaTags.Add(new MediaTag
            {
                MediaLibraryId = libraryId,
                MediaType = "movie",
                MediaId = mediaItemId,
                TagId = tag.Id,
                CreateTime = DateTime.UtcNow
            });
        }
    }

    /// <summary>
    /// 获取或创建 Tag 实体。命中缓存时零查询，只有首次出现的新标签才写库。
    /// </summary>
    private async Task<Tag> GetOrCreateTagAsync(MediaHouseDbContext context, string tagName, ScanLookupCache lookup)
    {
        tagName = tagName.Trim();
        if (tagName.Length == 0)
            throw new InvalidOperationException("标签名不能为空");

        if (lookup.Tags.TryGetValue(tagName, out var cached))
            return cached;

        // 缓存没命中不代表库里没有：MySQL 的比较是大小写/重音不敏感的，
        // "M女" 和 "m女" 在库里是同一行。先按列排序规则查一次，避免撞唯一键。
        var existing = await context.Tags.FirstOrDefaultAsync(t => t.TagName == tagName);
        if (existing != null)
        {
            lookup.Tags[tagName] = existing;
            return existing;
        }

        _logger.LogInformation("Creating new tag: {TagName}", tagName);

        var tag = new Tag
        {
            TagName = tagName,
            CreateTime = DateTime.UtcNow
        };

        context.Tags.Add(tag);

        try
        {
            await context.SaveChangesAsync(); // 需要拿到自增 Id 才能建关联
        }
        catch (DbUpdateException)
        {
            // 并发扫描或排序规则差异导致的唯一键冲突：放弃这条插入，改用库里已有的
            context.Entry(tag).State = EntityState.Detached;

            existing = await context.Tags.AsNoTracking().FirstOrDefaultAsync(t => t.TagName == tagName);
            if (existing is null) throw;

            _logger.LogWarning("Tag {TagName} 已存在，复用 Id={TagId}", tagName, existing.Id);
            lookup.Tags[tagName] = existing;
            return existing;
        }

        lookup.Tags[tagName] = tag;
        return tag;
    }

    /// <summary>
    /// 重建媒体人员（演员）关系。
    /// 调用方已经清空过该媒体的旧关系，这里只负责按 NFO 重新插入。
    /// </summary>
    private async Task UpsertMediaStaffAsync(
        MediaHouseDbContext context,
        int mediaItemId,
        List<string> actorNames,
        ScanLookupCache lookup)
    {
        // 同一个 NFO 里重复出现的演员只建一条关系（大小写不同也算重复：
        // 库里的唯一约束是大小写不敏感的）
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // 再按解析出来的 StaffId 去重：不同写法可能落到同一行演员上
        var usedStaffIds = new HashSet<int>();

        for (var sortOrder = 0; sortOrder < actorNames.Count; sortOrder++)
        {
            var actorName = actorNames[sortOrder];
            if (string.IsNullOrWhiteSpace(actorName))
                continue;

            var name = actorName.Trim();

            // 同一个 NFO 里重复出现的演员只建一条关系
            if (!seen.Add(name)) continue;

            var staff = await GetOrCreateStaffAsync(context, name, lookup);

            if (!usedStaffIds.Add(staff.Id))
            {
                _logger.LogInformation(
                    "演员 {StaffName} 与本次已处理的演员指向同一行（Id={StaffId}），跳过重复关联",
                    name, staff.Id);
                continue;
            }

            context.MediaStaffs.Add(new MediaStaff
            {
                MediaType = "movie",
                MediaId = mediaItemId,
                StaffId = staff.Id,
                RoleType = "actor",
                RoleName = null,
                SortOrder = sortOrder,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            });
        }
    }

    /// <summary>
    /// 获取或创建 Staff 实体。命中缓存时零查询。
    /// </summary>
    private async Task<Staff> GetOrCreateStaffAsync(MediaHouseDbContext context, string staffName, ScanLookupCache lookup)
    {
        staffName = staffName.Trim();
        if (staffName.Length == 0)
            throw new InvalidOperationException("演员名不能为空");

        if (lookup.Staffs.TryGetValue(staffName, out var cached))
            return cached;

        // 同标签：MySQL 的比较大小写不敏感，缓存没命中时先确认库里确实没有
        var existing = await context.Staffs.FirstOrDefaultAsync(s => s.Name == staffName);
        if (existing != null)
        {
            lookup.Staffs[staffName] = existing;
            return existing;
        }

        _logger.LogInformation("Creating new staff: {StaffName}", staffName);

        var staff = new Staff
        {
            Name = staffName,
            CreateTime = DateTime.UtcNow,
            UpdateTime = DateTime.UtcNow
        };

        context.Staffs.Add(staff);

        try
        {
            await context.SaveChangesAsync(); // 需要拿到自增 Id 才能建关联
        }
        catch (DbUpdateException)
        {
            context.Entry(staff).State = EntityState.Detached;

            existing = await context.Staffs.AsNoTracking().FirstOrDefaultAsync(s => s.Name == staffName);
            if (existing is null) throw;

            _logger.LogWarning("Staff {StaffName} 已存在，复用 Id={StaffId}", staffName, existing.Id);
            lookup.Staffs[staffName] = existing;
            return existing;
        }

        lookup.Staffs[staffName] = staff;
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
        List<MovieDirectory> existingMovieDirs,
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
                var normalized = NormalizePath(dir.FullPath);
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

            // 其余关联表也显式用 SQL 删，不依赖数据库级联
            await context.MediaImgs.Where(i => missingIds.Contains(i.MediaId)).ExecuteDeleteAsync();
            await context.MediaFiles.Where(f => missingIds.Contains(f.MediaId)).ExecuteDeleteAsync();
            await context.Movies.Where(m => missingIds.Contains(m.MediaId)).ExecuteDeleteAsync();

            // 媒体本体同样用 SQL 删。
            // 之前是 RemoveRange + SaveChanges，走跟踪器：本次扫描处理过的实体还挂在
            // 跟踪器里，但对应的行可能已经被上面的 SQL 删掉了，EF 拿着旧状态去
            // DELETE/UPDATE 就会撞 "expected to affect 1 row(s), but actually affected 0"。
            var removedMedia = await context.Medias
                .Where(m => missingIds.Contains(m.Id))
                .ExecuteDeleteAsync();

            // 上面绕过了跟踪器，把这些实体摘掉，免得后面的 SaveChanges 再碰它们
            DetachMissingMediaEntities(context, missingIds);

            log.DeletedCount = (log.DeletedCount ?? 0) + removedMedia;

            _logger.LogInformation(
                "清理媒体库 {LibraryId}: 媒体 {MediaCount} 条、播放记录 {PlayCount} 条、收藏 {FavorCount} 条",
                libraryId, removedMedia, removedPlayRecords, removedFavors);

            return removedMedia;
        }
        catch (Exception ex)
        {
            // 清理失败不影响本次扫描结果，记录下来下次再说
            _logger.LogError(ex, "清理媒体库 {LibraryId} 的失效媒体时出错", libraryId);
            return 0;
        }
    }

    /// <summary>
    /// 清理用的 SQL 删除绕过了跟踪器，把这些实体从上下文里摘掉，
    /// 避免后续 SaveChanges 拿着已经失效的状态再操作它们。
    /// </summary>
    private static void DetachMissingMediaEntities(MediaHouseDbContext context, List<int> missingIds)
    {
        var ids = missingIds.ToHashSet();

        foreach (var entry in context.ChangeTracker.Entries<Media>().ToList())
        {
            if (ids.Contains(entry.Entity.Id)) entry.State = EntityState.Detached;
        }

        foreach (var entry in context.ChangeTracker.Entries<MediaFile>().ToList())
        {
            if (ids.Contains(entry.Entity.MediaId)) entry.State = EntityState.Detached;
        }

        foreach (var entry in context.ChangeTracker.Entries<MediaImgs>().ToList())
        {
            if (ids.Contains(entry.Entity.MediaId)) entry.State = EntityState.Detached;
        }

        foreach (var entry in context.ChangeTracker.Entries<Movie>().ToList())
        {
            if (ids.Contains(entry.Entity.MediaId)) entry.State = EntityState.Detached;
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
    /// 扫描单个电影目录并返回元数据。
    /// 供「上传元数据后重扫」「手动搜刮」等场景使用，复用与批量扫描完全相同的处理流程。
    /// </summary>
    public async Task<MediaScanResult> ScanSingleMovieAsync(int libraryId, string movieDirName, string movieDirPath)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        var library = await context.MediaLibraries.FindAsync(libraryId) ??
            throw new InvalidOperationException($"Library {libraryId} not found");

        _logger.LogInformation("Scanning single movie directory: {DirName}", movieDirName);

        string[] files;
        try
        {
            files = Directory.GetFiles(movieDirPath);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            throw new InvalidOperationException($"无法读取目录 {movieDirPath}", ex);
        }

        var movieDir = new MovieDirectory(movieDirName, movieDirPath, files);
        var lookup = await ScanLookupCache.CreateAsync(context);

        var result = await ProcessMovieDirectoryAsync(context, libraryId, movieDir, null, lookup)
            ?? throw new InvalidOperationException($"No video file found in {movieDirPath}");

        await context.SaveChangesAsync();
        return result;
    }
}
