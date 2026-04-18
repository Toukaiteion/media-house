using MediaHouse.Data.Entities;

namespace MediaHouse.Events;

/// <summary>
/// 插件执行完成事件
/// </summary>
public class PluginExecutionCompletedEvent
{
    /// <summary>
    /// 执行日志 ID
    /// </summary>
    public int ExecutionId { get; set; }

    /// <summary>
    /// 插件 Key
    /// </summary>
    public string PluginKey { get; set; } = string.Empty;

    /// <summary>
    /// 业务 ID（用于关联业务数据）
    /// </summary>
    public int? BusinessId { get; set; }

    /// <summary>
    /// 业务类型（用于路由到不同的处理器）
    /// </summary>
    public PluginBusinessType? BusinessType { get; set; }

    /// <summary>
    /// 执行状态
    /// </summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>
    /// 元数据输出
    /// </summary>
    public string? MetadataOutput { get; set; }

    /// <summary>
    /// 执行开始时间
    /// </summary>
    public DateTime StartTime { get; set; }

    /// <summary>
    /// 执行结束时间
    /// </summary>
    public DateTime? EndTime { get; set; }
}
