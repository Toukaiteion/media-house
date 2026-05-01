using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using MediaHouse.Events;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class PluginExecutionService(
    IServiceScopeFactory scopeFactory,
    ILogger<PluginExecutionService> logger,
    IPluginService pluginService,
    IPluginConfigService pluginConfigService,
    IEventBus eventBus) : IPluginExecutionService
{
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<PluginExecutionService> _logger = logger;
    private readonly IPluginService _pluginService = pluginService;
    private readonly IPluginConfigService _pluginConfigService = pluginConfigService;
    private readonly IEventBus _eventBus = eventBus;

    private static readonly Dictionary<int, CancellationTokenSource> _executionCancellations = [];
    private static readonly object _lock = new();

    public async Task<PluginExecutionLog> ExecutePluginAsync(
        string pluginKey,
        string sourceDir,
        string? outputDir = null,
        string? pluginVersion = null,
        string? configName = null,
        int? businessId = null,
        PluginBusinessType? businessType = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        // Get plugin
        var plugin = await _pluginService.GetPluginByDbKeyAsync(pluginKey, pluginVersion) ??
            throw new InvalidOperationException($"Plugin {pluginKey} version {pluginVersion} not found");

        // Get plugin config
        PluginConfig? config = null;
        if (string.IsNullOrEmpty(configName))
        {
            // Try to get active config first, then fall back to "default" named config
            config = await _pluginConfigService.GetActiveConfigAsync(pluginKey);
            if (config == null)
            {
                var configs = await _pluginConfigService.GetPluginConfigsAsync(pluginKey);
                config = configs.FirstOrDefault(c => c.ConfigName == "default");
            }
            // If still null, we'll proceed with empty config
        }
        else
        {
            var configs = await _pluginConfigService.GetPluginConfigsAsync(pluginKey);
            config = configs.FirstOrDefault(c => c.ConfigName == configName);
            // If not found, we'll proceed with empty config
        }

        // Create a default empty config if none was found
        if (config == null)
        {
            config = new PluginConfig
            {
                PluginKey = pluginKey,
                ConfigName = "empty",
                ConfigData = "{}"
            };
        }

        // Create execution log
        var log = new PluginExecutionLog
        {
            PluginKey = pluginKey,
            PluginVersion = plugin.Version,
            BusinessId = businessId,
            BusinessType = businessType,
            ExecutionType = "manual",
            SourceDir = sourceDir,
            Status = "pending",
            StartTime = DateTime.UtcNow,
            ConfigId = config.Id
        };

        context.PluginExecutionLogs.Add(log);
        await context.SaveChangesAsync();

        // Execute plugin in background
        _ = Task.Run(() => ExecutePluginInternalAsync(plugin, config, log, sourceDir, outputDir), CancellationToken.None);

        return log;
    }

    public async Task<List<PluginExecutionLog>> ExecuteBatchPluginAsync(
        string pluginKey,
        int libraryId,
        List<int> mediaIds,
        string? configName = null,
        string? pluginVersion = null,
        PluginBusinessType? businessType = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        // Get plugin
        var plugin = await _pluginService.GetPluginByDbKeyAsync(pluginKey, pluginVersion) ??
            throw new InvalidOperationException($"Plugin {pluginKey} version {pluginVersion} not found");

        // Get plugin config
        PluginConfig? config = null;
        if (string.IsNullOrEmpty(configName))
        {
            // Try to get active config first, then fall back to "default" named config
            config = await _pluginConfigService.GetActiveConfigAsync(pluginKey);
            if (config == null)
            {
                var configs = await _pluginConfigService.GetPluginConfigsAsync(pluginKey);
                config = configs.FirstOrDefault(c => c.ConfigName == "default");
            }
            // If still null, we'll proceed with empty config
        }
        else
        {
            var configs = await _pluginConfigService.GetPluginConfigsAsync(pluginKey);
            config = configs.FirstOrDefault(c => c.ConfigName == configName);
            // If not found, we'll proceed with empty config
        }

        // Create a default empty config if none was found
        if (config == null)
        {
            config = new PluginConfig
            {
                PluginKey = pluginKey,
                ConfigName = "empty",
                ConfigData = "{}"
            };
        }

        // Get media items
        var mediaItems = await context.Medias
            .Where(m => mediaIds.Contains(m.Id) && m.LibraryId == libraryId)
            .ToListAsync();

        var logs = new List<PluginExecutionLog>();

        foreach (var media in mediaItems)
        {
            // Create execution log for each media
            var log = new PluginExecutionLog
            {
                PluginKey = pluginKey,
                PluginVersion = plugin.Version,
                BusinessId = media.Id,
                BusinessType = businessType,
                ExecutionType = "batch",
                SourceDir = media.Name, // Use media name as source dir identifier
                Status = "pending",
                StartTime = DateTime.UtcNow,
                ConfigId = config.Id
            };

            context.PluginExecutionLogs.Add(log);
            await context.SaveChangesAsync();

            logs.Add(log);

            // Execute plugin in background
            _ = Task.Run(() => ExecutePluginInternalAsync(plugin, config, log, media.Name, null), CancellationToken.None);
        }

        return logs;
    }

    public async Task<PluginExecutionLog?> GetExecutionLogAsync(int executionId)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        return await context.PluginExecutionLogs.FindAsync(executionId);
    }

    public async Task<List<PluginExecutionLog>> GetPluginLogsAsync(string pluginId, int? mediaId = null, int limit = 10)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        var query = context.PluginExecutionLogs
            .Where(l => l.PluginKey == pluginId);

        if (mediaId.HasValue)
        {
            query = query.Where(l => l.BusinessId == mediaId);
        }

        return await query
            .OrderByDescending(l => l.StartTime)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<bool> CancelExecutionAsync(int executionId)
    {
        lock (_lock)
        {
            if (_executionCancellations.TryGetValue(executionId, out var cts))
            {
                cts.Cancel();
                _logger.LogInformation("Cancelled execution {ExecutionId}", executionId);
                return true;
            }
        }

        return false;
    }

    public async Task<bool> UpdateExecutionProgressAsync(int executionId, int percent, string currentStep, string? message = null, DTOs.PluginMessageType? type = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        var log = await context.PluginExecutionLogs.FindAsync(executionId);
        if (log == null) return false;

        // 只有 progress 类型才更新进度
        if (type == DTOs.PluginMessageType.Progress)
        {
            log.ProgressPercent = percent;
            log.CurrentStep = currentStep;
        }

        // 如果 type 是 error，更新执行状态和错误消息
        if (type == DTOs.PluginMessageType.Error)
        {
            log.Status = "failed";
            if (!string.IsNullOrEmpty(message))
            {
                if (log.ErrorMessage != null)
                {
                    log.ErrorMessage += "\n" + message;
                } 
                else 
                {
                    log.ErrorMessage = message;
                }
            }
        }

        // 累积追加消息
        if (!string.IsNullOrEmpty(message))
        {
            if (string.IsNullOrEmpty(log.LogMessages))
            {
                log.LogMessages = message;
            }
            else
            {
                log.LogMessages += "\n" + message;
            }
        }

        await context.SaveChangesAsync();

        return true;
    }

    public async Task<bool> UpdateExecutionStatusAsync(int executionId, string status, string? errorMessage = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        var log = await context.PluginExecutionLogs.FindAsync(executionId);
        if (log == null) return false;

        log.Status = status;

        if (errorMessage != null)
        {
            log.ErrorMessage = errorMessage;
        }

        if (status == "success" || status == "failed" || status == "timeout")
        {
            log.EndTime = DateTime.UtcNow;
            log.DurationSeconds = (int)(log.EndTime.Value - log.StartTime).TotalSeconds;
        }

        await context.SaveChangesAsync();

        return true;
    }

    private async Task ExecutePluginInternalAsync(
        Plugin plugin,
        PluginConfig config,
        PluginExecutionLog log,
        string sourceDir,
        string? outputDir)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();
        var cts = new CancellationTokenSource();

        lock (_lock)
        {
            _executionCancellations[log.Id] = cts;
        }

        try
        {
            // Update status to running
            await UpdateExecutionStatusAsync(log.Id, "running");

            // Prepare input JSON
            var inputJson = PrepareInputJson(sourceDir, config.ConfigData, outputDir);

            // Save input data to log for retry capability
            var dbLog = await context.PluginExecutionLogs.FindAsync(log.Id);
            if (dbLog != null && string.IsNullOrEmpty(dbLog.Input))
            {
                dbLog.Input = inputJson;
                await context.SaveChangesAsync();
            }

            // Get runtime requirements
            int maxExecutionTimeSeconds = 300; // Default 5 minutes
            if (!string.IsNullOrEmpty(plugin.RuntimeRequirements))
            {
                try
                {
                    var requirements = System.Text.Json.JsonDocument.Parse(plugin.RuntimeRequirements);
                    if (requirements.RootElement.TryGetProperty("max_execution_time_seconds", out var timeProperty))
                    {
                        maxExecutionTimeSeconds = timeProperty.GetInt32();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to parse runtime requirements for plugin {PluginKey}", plugin.PluginKey);
                }
            }

            // Set timeout
            cts.CancelAfter(TimeSpan.FromSeconds(maxExecutionTimeSeconds));

            // Execute plugin
            var runner = new PluginRunner(_logger);
            var result = await runner.ExecuteAsync(
                plugin.PluginDir,
                plugin.EntryPoint,
                inputJson,
                cts.Token,
                async (progress) =>
                {
                    await UpdateExecutionProgressAsync(log.Id, progress.Percent, progress.Step, progress.Message, progress.Type);
                },
                async (errorMsg) =>
                {
                    await UpdateExecutionProgressAsync(log.Id, 0, "", errorMsg, null);
                });

            // Update execution log with result
            if (dbLog != null)
            {
                if (result.Success)
                {
                    dbLog.Status = "success";
                    dbLog.MetadataOutput = result.MetadataOutput;
                    dbLog.CreatedFiles = result.CreatedFiles;
                    dbLog.Statistics = result.Statistics;
                }
                else if (cts.Token.IsCancellationRequested)
                {
                    dbLog.Status = "timeout";
                }
                else
                {
                    dbLog.Status = "failed";
                    if (!string.IsNullOrEmpty(dbLog.ErrorMessage))
                    {
                        dbLog.ErrorMessage += "\n" + result.ErrorMessage;
                    }
                    else
                    {
                    dbLog.ErrorMessage = result.ErrorMessage;
                    }
                }

                dbLog.EndTime = DateTime.UtcNow;
                dbLog.DurationSeconds = (int)(dbLog.EndTime.Value - dbLog.StartTime).TotalSeconds;
                dbLog.ProgressPercent = 100;

                await context.SaveChangesAsync();

                // 发布插件执行完成事件
                if (result.Success && !string.IsNullOrEmpty(result.MetadataOutput))
                {
                    var completedEvent = new PluginExecutionCompletedEvent
                    {
                        ExecutionId = log.Id,
                        PluginKey = plugin.PluginKey,
                        BusinessId = log.BusinessId,
                        BusinessType = log.BusinessType,
                        Status = "success",
                        MetadataOutput = result.MetadataOutput,
                        CreatedFile = result.CreatedFiles,
                        StartTime = dbLog.StartTime,
                        EndTime = dbLog.EndTime,
                        SourceDir = sourceDir,
                        OutputDir = outputDir
                    };
                    await _eventBus.PublishAsync(completedEvent);
                }
            }

            _logger.LogInformation("Plugin execution completed: {ExecutionId} - {Status}", log.Id, dbLog?.Status);
        }
        catch (TaskCanceledException)
        {
            await UpdateExecutionStatusAsync(log.Id, "timeout", "Execution timed out");
            _logger.LogWarning("Plugin execution timed out: {ExecutionId}", log.Id);
        }
        catch (Exception ex)
        {
            await UpdateExecutionStatusAsync(log.Id, "failed", ex.Message);
            _logger.LogError(ex, "Plugin execution failed: {ExecutionId}", log.Id);
        }
        finally
        {
            lock (_lock)
            {
                _executionCancellations.Remove(log.Id);
            }
        }
    }

    private string PrepareInputJson(string sourceDir, string? configData, string? outputDir)
    {
        // Handle empty/missing config - use empty object {}
        var configDataToUse = string.IsNullOrEmpty(configData) ? "{}" : configData;
        var inputDoc = System.Text.Json.JsonDocument.Parse(configDataToUse);
        var configElement = inputDoc.RootElement;

        var input = new
        {
            action = "scrape",
            source_dir = sourceDir,
            output_dir = string.IsNullOrEmpty(outputDir) ? sourceDir : outputDir,
            config = configElement
        };

        return System.Text.Json.JsonSerializer.Serialize(input);
    }

    public async Task<PluginExecutionLog?> RetryPluginAsync(int executionId)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();

        // Get original execution log
        var originalLog = await context.PluginExecutionLogs.FindAsync(executionId);
        if (originalLog == null)
        {
            _logger.LogWarning("Original execution log not found: {ExecutionId}", executionId);
            return null;
        }

        // Validate retry conditions
        if (originalLog.Status != "failed" && originalLog.Status != "timeout")
        {
            _logger.LogWarning("Cannot retry execution with status: {Status}", originalLog.Status);
            return null;
        }

        if (originalLog.RetryCount >= originalLog.MaxRetries)
        {
            _logger.LogWarning("Max retries exceeded for execution: {ExecutionId}", executionId);
            return null;
        }

        // Check if input data exists
        if (string.IsNullOrEmpty(originalLog.Input))
        {
            _logger.LogWarning("Input data not available for retry: {ExecutionId}", executionId);
            return null;
        }

        // Create new execution log for retry
        var retryLog = new PluginExecutionLog
        {
            PluginKey = originalLog.PluginKey,
            PluginVersion = originalLog.PluginVersion,
            BusinessId = originalLog.BusinessId,
            BusinessType = originalLog.BusinessType,
            ExecutionType = originalLog.ExecutionType,
            SourceDir = originalLog.SourceDir,
            Status = "pending",
            StartTime = DateTime.UtcNow,
            ConfigId = originalLog.ConfigId,
            RetryCount = originalLog.RetryCount + 1,
            MaxRetries = originalLog.MaxRetries,
            Input = originalLog.Input,
            LastRetryTime = DateTime.UtcNow
        };

        context.PluginExecutionLogs.Add(retryLog);
        await context.SaveChangesAsync();

        // Execute plugin in background using saved input data
        _ = Task.Run(() => ExecutePluginWithSavedInputAsync(retryLog, originalLog.Input), CancellationToken.None);

        _logger.LogInformation("Plugin execution retry started: {OriginalExecutionId} -> {RetryExecutionId} (Attempt {Count})",
            executionId, retryLog.Id, retryLog.RetryCount);

        return retryLog;
    }

    private async Task ExecutePluginWithSavedInputAsync(
        PluginExecutionLog log,
        string savedInputJson)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MediaHouseDbContext>();
        var cts = new CancellationTokenSource();

        lock (_lock)
        {
            _executionCancellations[log.Id] = cts;
        }

        try
        {
            // Update status to running
            await UpdateExecutionStatusAsync(log.Id, "running");

            // Parse saved input to get plugin key and directories
            var inputDoc = System.Text.Json.JsonDocument.Parse(savedInputJson);
            var inputRoot = inputDoc.RootElement;
            var pluginKey = log.PluginKey;
            var sourceDir = inputRoot.TryGetProperty("source_dir", out var sourceDirProp) ? sourceDirProp.GetString() ?? log.SourceDir : log.SourceDir;
            var outputDir = inputRoot.TryGetProperty("output_dir", out var outputDirProp) ? outputDirProp.GetString() : sourceDir;

            // Get plugin
            var plugin = await _pluginService.GetPluginByDbKeyAsync(pluginKey, log.PluginVersion);
            if (plugin == null)
            {
                _logger.LogWarning("Plugin not found for retry: {PluginKey} {Version}", pluginKey, log.PluginVersion);
                await UpdateExecutionStatusAsync(log.Id, "failed", "Plugin not found");
                return;
            }

            // Get plugin config
            PluginConfig? config = null;
            if (log.ConfigId.HasValue)
            {
                config = await context.PluginConfigs.FindAsync(log.ConfigId.Value);
            }

            // Create a default empty config if none was found
            if (config == null)
            {
                config = new PluginConfig
                {
                    PluginKey = pluginKey,
                    ConfigName = "empty",
                    ConfigData = "{}"
                };
            }

            // Get runtime requirements
            int maxExecutionTimeSeconds = 300; // Default 5 minutes
            if (!string.IsNullOrEmpty(plugin.RuntimeRequirements))
            {
                try
                {
                    var requirements = System.Text.Json.JsonDocument.Parse(plugin.RuntimeRequirements);
                    if (requirements.RootElement.TryGetProperty("max_execution_time_seconds", out var timeProperty))
                    {
                        maxExecutionTimeSeconds = timeProperty.GetInt32();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to parse runtime requirements for plugin {PluginKey}", plugin.PluginKey);
                }
            }

            // Set timeout
            cts.CancelAfter(TimeSpan.FromSeconds(maxExecutionTimeSeconds));

            // Execute plugin with saved input data
            var runner = new PluginRunner(_logger);
            var result = await runner.ExecuteAsync(
                plugin.PluginDir,
                plugin.EntryPoint,
                savedInputJson,
                cts.Token,
                async (progress) =>
                {
                    await UpdateExecutionProgressAsync(log.Id, progress.Percent, progress.Step, progress.Message, progress.Type);
                },
                async (errorMsg) =>
                {
                    await UpdateExecutionProgressAsync(log.Id, 0, "", errorMsg, null);
                });

            // Update execution log with result
            var dbLog = await context.PluginExecutionLogs.FindAsync(log.Id);
            if (dbLog != null)
            {
                if (result.Success)
                {
                    dbLog.Status = "success";
                    dbLog.MetadataOutput = result.MetadataOutput;
                    dbLog.CreatedFiles = result.CreatedFiles;
                    dbLog.Statistics = result.Statistics;
                }
                else if (cts.Token.IsCancellationRequested)
                {
                    dbLog.Status = "timeout";
                }
                else
                {
                    dbLog.Status = "failed";
                    if (!string.IsNullOrEmpty(dbLog.ErrorMessage))
                    {
                        dbLog.ErrorMessage += "\n" + result.ErrorMessage;
                    }
                    else
                    {
                        dbLog.ErrorMessage = result.ErrorMessage;
                    }
                }

                dbLog.EndTime = DateTime.UtcNow;
                dbLog.DurationSeconds = (int)(dbLog.EndTime.Value - dbLog.StartTime).TotalSeconds;
                dbLog.ProgressPercent = 100;

                await context.SaveChangesAsync();

                // 发布插件执行完成事件
                if (result.Success && !string.IsNullOrEmpty(result.MetadataOutput))
                {
                    var completedEvent = new PluginExecutionCompletedEvent
                    {
                        ExecutionId = log.Id,
                        PluginKey = plugin.PluginKey,
                        BusinessId = log.BusinessId,
                        BusinessType = log.BusinessType,
                        Status = "success",
                        MetadataOutput = result.MetadataOutput,
                        CreatedFile = result.CreatedFiles,
                        StartTime = dbLog.StartTime,
                        EndTime = dbLog.EndTime,
                        SourceDir = sourceDir,
                        OutputDir = outputDir
                    };
                    await _eventBus.PublishAsync(completedEvent);
                }
            }

            _logger.LogInformation("Plugin retry execution completed: {ExecutionId} - {Status}", log.Id, dbLog?.Status);
        }
        catch (TaskCanceledException)
        {
            await UpdateExecutionStatusAsync(log.Id, "timeout", "Execution timed out");
            _logger.LogWarning("Plugin retry execution timed out: {ExecutionId}", log.Id);
        }
        catch (Exception ex)
        {
            await UpdateExecutionStatusAsync(log.Id, "failed", ex.Message);
            _logger.LogError(ex, "Plugin retry execution failed: {ExecutionId}", log.Id);
        }
        finally
        {
            lock (_lock)
            {
                _executionCancellations.Remove(log.Id);
            }
        }
    }
}
