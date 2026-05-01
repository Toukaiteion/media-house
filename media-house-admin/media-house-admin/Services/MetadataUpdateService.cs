using Microsoft.AspNetCore.Http;
using MediaHouse.Data;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;
using System.IO.Compression;

namespace MediaHouse.Services;

public class MetadataUpdateService(
    MediaHouseDbContext dbContext,
    IScanService scanService,
    ILogger<MetadataUpdateService> logger) : IMetadataUpdateService
{
    private readonly MediaHouseDbContext _dbContext = dbContext;
    private readonly IScanService _scanService = scanService;
    private readonly ILogger<MetadataUpdateService> _logger = logger;

    private static readonly string[] ValidMetadataExtensions =
        [".nfo", ".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm"];

    public async Task<MetadataUpdateResult> UpdateMetadataFromArchiveAsync(int mediaId, IFormFile file)
    {
        string? tempZipPath = null;
        string? tempExtractDir = null;

        try
        {
            // 1. 验证参数
            if (mediaId <= 0)
            {
                return new MetadataUpdateResult { Success = false, ErrorMessage = "Invalid media ID" };
            }

            var validationResult = ValidateUploadedFile(file);
            if (!validationResult.Success)
            {
                return validationResult;
            }

            // 2. 获取媒体实体和视频路径
            var media = await _dbContext.Medias
                .Include(m => m.Library)
                .Include(m => m.MediaFiles)
                .FirstOrDefaultAsync(m => m.Id == mediaId);

            if (media == null)
            {
                return new MetadataUpdateResult { Success = false, ErrorMessage = "Media not found" };
            }

            if (!media.MediaFiles.Any())
            {
                return new MetadataUpdateResult { Success = false, ErrorMessage = "Media has no video files" };
            }

            var videoPath = media.MediaFiles.First().Path;
            var movieDirPath = System.IO.Path.GetDirectoryName(videoPath);

            if (string.IsNullOrEmpty(movieDirPath) || !System.IO.Directory.Exists(movieDirPath))
            {
                return new MetadataUpdateResult { Success = false, ErrorMessage = "Movie directory not found" };
            }

            // 3. 保存上传的 ZIP 到临时目录
            tempZipPath = await SaveToTempFile(file);

            // 4. 解压 ZIP 到临时目录
            tempExtractDir = ExtractZipToTemp(tempZipPath);

            // 5. 验证解压内容
            var (isValid, errorMessage, isNested) = ValidateExtractedContent(tempExtractDir);

            if (!isValid)
            {
                return new MetadataUpdateResult { Success = false, ErrorMessage = errorMessage ?? "Invalid archive content" };
            }

            // 6. 复制文件到电影目录（允许覆盖视频文件）
            CopyMetadataFiles(tempExtractDir, movieDirPath, isNested);

            // 7. 触发扫描更新元数据
            var scanResult = await TriggerMetadataScan(media, videoPath, movieDirPath);

            _logger.LogInformation("Successfully updated metadata for media {MediaId} from archive", mediaId);

            return new MetadataUpdateResult
            {
                Success = true,
                MediaId = scanResult.Media.Id,
                Title = scanResult.Media.Title
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating metadata for media {MediaId}", mediaId);
            return new MetadataUpdateResult { Success = false, ErrorMessage = $"Failed to update metadata: {ex.Message}" };
        }
        finally
        {
            // 8. 清理临时文件
            CleanUpTempFiles(tempZipPath, tempExtractDir);
        }
    }

    private MetadataUpdateResult ValidateUploadedFile(IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return new MetadataUpdateResult { Success = false, ErrorMessage = "No file uploaded" };
        }

        var extension = System.IO.Path.GetExtension(file.FileName).ToLower();
        if (extension != ".zip")
        {
            return new MetadataUpdateResult { Success = false, ErrorMessage = "Only ZIP files are supported" };
        }

        return new MetadataUpdateResult { Success = true };
    }

    private async Task<string> SaveToTempFile(IFormFile file)
    {
        var tempPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"metadata_upload_{Guid.NewGuid()}.zip");

        using var tempStream = System.IO.File.Create(tempPath);
        await file.CopyToAsync(tempStream);

        return tempPath;
    }

    private string ExtractZipToTemp(string zipFilePath)
    {
        var extractDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"metadata_extract_{Guid.NewGuid()}");
        System.IO.Directory.CreateDirectory(extractDir);

        ZipFile.ExtractToDirectory(zipFilePath, extractDir);

        return extractDir;
    }

    private (bool IsValid, string? ErrorMessage, bool IsNestedStructure) ValidateExtractedContent(
        string extractDir)
    {
        bool isNestedStructure = false;

        var allEntries = System.IO.Directory.GetFileSystemEntries(extractDir, "*", System.IO.SearchOption.AllDirectories);
        var directories = System.IO.Directory.GetDirectories(extractDir);
        var files = System.IO.Directory.GetFiles(extractDir);

        // 检查路径遍历攻击
        foreach (var entry in allEntries)
        {
            var relativePath = System.IO.Path.GetRelativePath(extractDir, entry);
            if (relativePath.Contains("..") || relativePath.Contains("//"))
            {
                return (false, "Invalid file path detected", isNestedStructure);
            }
        }

        // 检测结构：嵌套结构如果只有一个子目录
        if (directories.Length == 1 && files.Length == 0)
        {
            isNestedStructure = true;
            var contentDir = directories[0];
            var contentFiles = System.IO.Directory.GetFiles(contentDir, "*", System.IO.SearchOption.AllDirectories);
            var (isValid, errorMessage) = ValidateFiles(contentFiles, contentDir);
            return (isValid, errorMessage, isNestedStructure);
        }
        else if (directories.Length == 0 ||
                 (directories.Length == 1 &&
                  System.IO.Path.GetFileName(directories[0]).Equals("extrafanart", System.StringComparison.OrdinalIgnoreCase)))
        {
            // 扁平结构（或扁平 + extrafanart）
            isNestedStructure = false;
            var (isValid, errorMessage) = ValidateFiles(allEntries, extractDir);
            return (isValid, errorMessage, isNestedStructure);
        }
        else
        {
            return (false, "Invalid archive structure. Expected flat files or single directory with metadata", isNestedStructure);
        }
    }

    private (bool IsValid, string? ErrorMessage) ValidateFiles(
        System.Collections.Generic.IEnumerable<string> files,
        string rootDir)
    {
        bool hasValidFile = false;

        foreach (var file in files)
        {
            if (System.IO.Directory.Exists(file))
                continue;

            var extension = System.IO.Path.GetExtension(file).ToLower();

            // 验证文件扩展名
            if (!ValidMetadataExtensions.Contains(extension))
            {
                return (false, $"Invalid file type: {extension}");
            }

            hasValidFile = true;
        }

        if (!hasValidFile)
        {
            return (false, "Archive must contain at least one valid file");
        }

        return (true, null);
    }

    private void CopyMetadataFiles(
        string sourceDir,
        string targetDir,
        bool isNestedStructure)
    {
        var actualSourceDir = isNestedStructure
            ? System.IO.Directory.GetDirectories(sourceDir).First()
            : sourceDir;

        // 复制所有文件（包括视频文件，允许覆盖）
        foreach (var sourceFile in System.IO.Directory.GetFiles(actualSourceDir, "*", System.IO.SearchOption.AllDirectories))
        {
            var relativePath = System.IO.Path.GetRelativePath(actualSourceDir, sourceFile);
            var destFile = System.IO.Path.Combine(targetDir, relativePath);
            var destDir = System.IO.Path.GetDirectoryName(destFile);

            if (destDir != null && !System.IO.Directory.Exists(destDir))
            {
                System.IO.Directory.CreateDirectory(destDir);
            }

            System.IO.File.Copy(sourceFile, destFile, true);

            _logger.LogDebug("Copied {RelativePath}", relativePath);
        }
    }

    private void CleanUpTempFiles(string? tempZipPath, string? tempExtractDir)
    {
        if (!string.IsNullOrEmpty(tempZipPath) && System.IO.File.Exists(tempZipPath))
        {
            try
            {
                System.IO.File.Delete(tempZipPath);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete temp ZIP file: {TempPath}", tempZipPath);
            }
        }

        if (!string.IsNullOrEmpty(tempExtractDir) && System.IO.Directory.Exists(tempExtractDir))
        {
            try
            {
                System.IO.Directory.Delete(tempExtractDir, true);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete temp extract directory: {TempPath}", tempExtractDir);
            }
        }
    }

    private async Task<MediaScanResult> TriggerMetadataScan(
        Media media,
        string videoPath,
        string movieDirPath)
    {
        var libraryId = media.LibraryId;
        var movieDirName = System.IO.Path.GetFileName(movieDirPath);

        _logger.LogInformation(
            "Triggering metadata scan for media {MediaId} in directory {DirName}",
            media.Id,
            movieDirName);

        return await _scanService.ScanSingleMovieAsync(libraryId, movieDirName, movieDirPath);
    }
}