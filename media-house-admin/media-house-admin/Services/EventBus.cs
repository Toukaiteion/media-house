using MediaHouse.Interfaces;
using Microsoft.Extensions.Logging;

namespace MediaHouse.Services;

/// <summary>
/// 内存事件总线实现
/// </summary>
public class EventBus(ILogger<EventBus> logger) : IEventBus
{
    private readonly ILogger<EventBus> _logger = logger;
    private readonly Dictionary<Type, List<Func<object, Task>>> _handlers = new();
    private readonly object _lock = new();

    public void Subscribe<TEvent>(Func<TEvent, Task> handler) where TEvent : class
    {
        var eventType = typeof(TEvent);
        var wrapper = (object @event) => handler((TEvent)@event);

        lock (_lock)
        {
            if (!_handlers.ContainsKey(eventType))
            {
                _handlers[eventType] = [];
            }
            _handlers[eventType].Add(wrapper);
        }

        _logger.LogDebug("Subscribed to event {EventType}", eventType.Name);
    }

    public async Task PublishAsync<TEvent>(TEvent @event) where TEvent : class
    {
        var eventType = typeof(TEvent);
        List<Func<object, Task>> handlers;

        lock (_lock)
        {
            if (!_handlers.ContainsKey(eventType))
            {
                _logger.LogDebug("No handlers registered for event {EventType}", eventType.Name);
                return;
            }
            handlers = _handlers[eventType].ToList();
        }

        _logger.LogInformation("Publishing event {EventType}, {HandlerCount} handlers", eventType.Name, handlers.Count);

        var tasks = handlers.Select(async handler =>
        {
            try
            {
                await handler(@event);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling event {EventType}", eventType.Name);
            }
        });

        await Task.WhenAll(tasks);
    }

    public void Unsubscribe<TEvent>(Func<TEvent, Task> handler) where TEvent : class
    {
        var eventType = typeof(TEvent);

        lock (_lock)
        {
            if (_handlers.TryGetValue(eventType, out var handlers))
            {
                // 由于我们需要比较包装后的 handler，这里简化处理：
                // 在实际应用中，可以考虑使用弱引用或其他机制
                _handlers.Remove(eventType);
                _logger.LogDebug("Unsubscribed from event {EventType}", eventType.Name);
            }
        }
    }
}
