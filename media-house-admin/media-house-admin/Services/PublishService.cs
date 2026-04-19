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
    ILogger<PublishService> logger,
    IScanService scanService) : IPublishService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly UploadSettings _settings = uploadSettings.Value;
    private readonly ILogger<PublishService> _logger = logger;
    private readonly IScanService _scanService = scanService;

    private static string SanitizeDirectoryName(string name)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        return string.Join("_", name.Split(invalidChars));
    }

    private void CopyDirectory(string sourceDir, string targetDir)
    {
        Directory.CreateDirectory(targetDir);

        foreach (var file in Directory.GetFiles(sourceDir))
        {
            var fileName = Path.GetFileName(file);
            var destPath = Path.Combine(targetDir, fileName);
            File.Copy(file, destPath);
        }

        foreach (var subDir in Directory.GetDirectories(sourceDir))
        {
            var dirName = Path.GetFileName(subDir);
            var destSubDir = Path.Combine(targetDir, dirName);
            CopyDirectory(subDir, destSubDir);
        }
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

        var stagingDir = Path.GetDirectoryName(stagingMedia.VideoPath) ?? string.Empty;
        if (!Directory.Exists(stagingDir))
        {
            throw new InvalidOperationException($"Staging directory not found: {stagingDir}");
        }

        // 1. 确定目标目录名（优先使用 code，否则使用 title）
        var targetDirName = SanitizeDirectoryName(
            string.IsNullOrEmpty(stagingMedia.Code) ? stagingMedia.Title : stagingMedia.Code);
        var targetDir = Path.Combine(library.Path, targetDirName);

        // 检查目标目录是否已存在
        if (Directory.Exists(targetDir))
        {
            throw new InvalidOperationException($"Target directory already exists: {targetDir}");
        }

        // 2. 复制整个 staging 目录到库目录
        CopyDirectory(stagingDir, targetDir);
        _logger.LogInformation("Copied staging directory from {Source} to {Destination}", stagingDir, targetDir);

        try
        {
            // 3. 调用 ScanSingleMovieAsync 扫描新目录
            var scanResult = await _scanService.ScanSingleMovieAsync(
                request.LibraryId,
                targetDirName,
                targetDir);

            // 4. 验证扫描结果（检查必要信息是否存在）
            if (scanResult.Media == null || scanResult.Movie == null || scanResult.MediaFile == null)
            {
                throw new InvalidOperationException("Scan did not create required media records");
            }

            // 5. 删除 stagingMedia 记录
            _context.StagingMedias.Remove(stagingMedia);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Published staging {StagingId} to library {LibraryId} as media {MediaId}",
                stagingMediaId, request.LibraryId, scanResult.Media.Id);

            // 6. 清理原 staging 目录
            CleanupStagingDirectory(stagingDir);

            return new PublishResponseDto
            {
                MediaId = scanResult.Media.Id,
                MovieId = scanResult.Movie.Id,
                Status = "published"
            };
        }
        catch
        {
            // 失败：删除库中刚刚复制的目录
            if (Directory.Exists(targetDir))
            {
                Directory.Delete(targetDir, true);
                _logger.LogWarning("Rollback: deleted target directory {TargetDir}", targetDir);
            }
            throw;
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
