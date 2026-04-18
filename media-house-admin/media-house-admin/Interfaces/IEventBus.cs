namespace MediaHouse.Interfaces;

/// <summary>
/// 事件总线接口 - 提供简单的发布-订阅机制
/// </summary>
public interface IEventBus
{
    /// <summary>
    /// 订阅事件
    /// </summary>
    /// <typeparam name="TEvent">事件类型</typeparam>
    /// <param name="handler">事件处理器</param>
    void Subscribe<TEvent>(Func<TEvent, Task> handler) where TEvent : class;

    /// <summary>
    /// 发布事件
    /// </summary>
    /// <typeparam name="TEvent">事件类型</typeparam>
    /// <param name="event">事件数据</param>
    Task PublishAsync<TEvent>(TEvent @event) where TEvent : class;

    /// <summary>
    /// 取消订阅事件
    /// </summary>
    /// <typeparam name="TEvent">事件类型</typeparam>
    /// <param name="handler">事件处理器</param>
    void Unsubscribe<TEvent>(Func<TEvent, Task> handler) where TEvent : class;
}
