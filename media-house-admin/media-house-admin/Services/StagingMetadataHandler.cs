using MediaHouse.Events;
using MediaHouse.Interfaces;
using Microsoft.Extensions.Logging;

namespace MediaHouse.Services;

/// <summary>
/// 暂存媒体元数据处理器 - 订阅插件执行完成事件并更新暂存媒体元数据
/// </summary>
public class StagingMetadataHandler(
    IEventBus eventBus,
    IServiceScopeFactory serviceScopeFactory,
    ILogger<StagingMetadataHandler> logger) : IHostedService
{
    private readonly IEventBus _eventBus = eventBus;
    private readonly IServiceScopeFactory _serviceScopeFactory = serviceScopeFactory;
    private readonly ILogger<StagingMetadataHandler> _logger = logger;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        // 订阅插件执行完成事件
        _eventBus.Subscribe<PluginExecutionCompletedEvent>(HandlePluginExecutionCompletedAsync);
        _logger.LogInformation("StagingMetadataHandler started and subscribed to PluginExecutionCompletedEvent");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("StagingMetadataHandler stopped");
        return Task.CompletedTask;
    }

    private async Task HandlePluginExecutionCompletedAsync(PluginExecutionCompletedEvent @event)
    {
        try
        {
            // 只处理成功的执行
            if (@event.Status != "success")
            {
                _logger.LogDebug("Skipping non-success plugin execution: {ExecutionId} - {Status}", @event.ExecutionId, @event.Status);
                return;
            }

            // 确保有 BusinessId 和元数据输出
            if (!@event.BusinessId.HasValue || string.IsNullOrEmpty(@event.MetadataOutput))
            {
                _logger.LogDebug("Skipping plugin execution without BusinessId or MetadataOutput: {ExecutionId}", @event.ExecutionId);
                return;
            }

            _logger.LogInformation(
                "Processing plugin execution completion: ExecutionId={ExecutionId}, PluginKey={PluginKey}, BusinessId={BusinessId}",
                @event.ExecutionId,
                @event.PluginKey,
                @event.BusinessId.Value);

            using var scope = _serviceScopeFactory.CreateScope();
            var _stagingService = scope.ServiceProvider.GetRequiredService<IStagingService>();
            // 调用 StagingService 更新元数据
            await _stagingService.TryUpdateMetadataFromPluginExecutionAsync(@event.BusinessId.Value, @event.MetadataOutput);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling PluginExecutionCompletedEvent for ExecutionId {ExecutionId}", @event.ExecutionId);
        }
    }
}
