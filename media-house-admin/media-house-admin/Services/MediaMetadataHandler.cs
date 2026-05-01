using MediaHouse.Events;
using MediaHouse.Interfaces;
using MediaHouse.Data.Entities;
using MediaHouse.Data;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

/// <summary>
/// 媒体元数据处理器 - 订阅插件执行完成事件并更新媒体元数据
/// </summary>
public class MediaMetadataHandler(
    IEventBus eventBus,
    IServiceScopeFactory serviceScopeFactory,
    ILogger<MediaMetadataHandler> logger) : IHostedService
{
    private readonly IEventBus _eventBus = eventBus;
    private readonly IServiceScopeFactory _serviceScopeFactory = serviceScopeFactory;
    private readonly ILogger<MediaMetadataHandler> _logger = logger;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        // 订阅插件执行完成事件
        _eventBus.Subscribe<PluginExecutionCompletedEvent>(HandlePluginExecutionCompletedAsync);
        _logger.LogInformation("MediaMetadataHandler started and subscribed to PluginExecutionCompletedEvent");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("MediaMetadataHandler stopped");
        return Task.CompletedTask;
    }

    private async Task HandlePluginExecutionCompletedAsync(PluginExecutionCompletedEvent @event)
    {
        try
        {
            // 只处理成功的媒体类型执行
            if (@event.BusinessType != PluginBusinessType.Media || @event.Status != "success")
            {
                _logger.LogDebug("Skipping plugin execution: ExecutionId={ExecutionId}, BusinessType={BusinessType}, Status={Status}",
                    @event.ExecutionId, @event.BusinessType?.ToString() ?? "null", @event.Status);
                return;
            }

            // 确保有 SourceDir 和 OutputDir
            if (string.IsNullOrEmpty(@event.SourceDir) || string.IsNullOrEmpty(@event.OutputDir))
            {
                _logger.LogWarning("Skipping plugin execution without SourceDir or OutputDir: {ExecutionId}", @event.ExecutionId);
                return;
            }

            // 确保有 BusinessId
            if (!@event.BusinessId.HasValue)
            {
                _logger.LogWarning("Skipping plugin execution without BusinessId: {ExecutionId}", @event.ExecutionId);
                return;
            }

            _logger.LogInformation(
                "Processing media plugin execution completion: ExecutionId={ExecutionId}, PluginKey={PluginKey}, BusinessId={BusinessId}, SourceDir={SourceDir}, OutputDir={OutputDir}",
                @event.ExecutionId,
                @event.PluginKey,
                @event.BusinessId.Value,
                @event.SourceDir,
                @event.OutputDir);

            using var scope = _serviceScopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

            // 获取媒体信息以获取 LibraryId
            var media = await dbContext.Medias
                .Include(m => m.Library)
                .FirstOrDefaultAsync(m => m.Id == @event.BusinessId.Value);

            if (media == null || media.Library == null)
            {
                _logger.LogWarning("Media or Library not found for BusinessId: {BusinessId}", @event.BusinessId.Value);
                return;
            }

            // 复制输出目录内容到源目录
            await CopyOutputToSourceAsync(@event.OutputDir, @event.SourceDir);

            // 删除临时输出目录
            try
            {
                if (Directory.Exists(@event.OutputDir))
                {
                    Directory.Delete(@event.OutputDir, true);
                    _logger.LogInformation("Deleted output directory: {OutputDir}", @event.OutputDir);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete output directory: {OutputDir}", @event.OutputDir);
            }

            // 调用扫描服务重新扫描
            var scanService = scope.ServiceProvider.GetRequiredService<IScanService>();
            var movieDirName = new DirectoryInfo(@event.SourceDir).Name;
            var result = await scanService.ScanSingleMovieAsync(media.Library.Id, movieDirName, @event.SourceDir);

            _logger.LogInformation(
                "Scan completed for media {MediaId}: MediaId={ScannedMediaId}",
                @event.BusinessId.Value, result.Media?.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling PluginExecutionCompletedEvent for ExecutionId {ExecutionId}", @event.ExecutionId);
        }
    }

    private async Task CopyOutputToSourceAsync(string outputDir, string sourceDir)
    {
        _logger.LogInformation("Copying files from {OutputDir} to {SourceDir}", outputDir, sourceDir);

        if (!Directory.Exists(outputDir))
        {
            _logger.LogWarning("Output directory does not exist: {OutputDir}", outputDir);
            return;
        }

        if (!Directory.Exists(sourceDir))
        {
            _logger.LogWarning("Source directory does not exist: {SourceDir}", sourceDir);
            return;
        }

        await CopyDirectoryRecursiveAsync(outputDir, sourceDir);

        _logger.LogInformation("Copy completed from {OutputDir} to {SourceDir}", outputDir, sourceDir);
    }

    private async Task CopyDirectoryRecursiveAsync(string sourcePath, string targetPath)
    {
        // 确保目标目录存在
        Directory.CreateDirectory(targetPath);

        // 复制当前目录中的所有文件
        foreach (var filePath in Directory.GetFiles(sourcePath))
        {
            var fileName = Path.GetFileName(filePath);
            var targetFilePath = Path.Combine(targetPath, fileName);
            File.Copy(filePath, targetFilePath, overwrite: true);
            _logger.LogDebug("Copied file: {Source} -> {Target}", filePath, targetFilePath);
        }

        // 递归复制子目录
        foreach (var sourceSubDir in Directory.GetDirectories(sourcePath))
        {
            var subDirName = Path.GetFileName(sourceSubDir);
            var targetSubDir = Path.Combine(targetPath, subDirName);
            await CopyDirectoryRecursiveAsync(sourceSubDir, targetSubDir);
        }
    }
}
