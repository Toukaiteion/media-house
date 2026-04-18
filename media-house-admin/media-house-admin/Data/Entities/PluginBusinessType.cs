namespace MediaHouse.Data.Entities;

/// <summary>
/// 插件执行的业务类型
/// </summary>
public enum PluginBusinessType
{
    /// <summary>
    /// 默认值，无特定业务类型
    /// </summary>
    None,

    /// <summary>
    /// 暂存媒体搜刮
    /// </summary>
    Staging,

    /// <summary>
    /// 媒体表搜刮
    /// </summary>
    Media,

    /// <summary>
    /// 自定义业务类型
    /// </summary>
    Custom
}
