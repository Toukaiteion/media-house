namespace MediaHouse.Data.Adapters;

/// <summary>
/// SystemLog 数据库适配器接口
/// 用于处理不同数据库（MySQL/SQLite）之间的字段映射差异
/// </summary>
public interface ISystemLogAdapter
{
    /// <summary>
    /// 获取数据库列名配置
    /// </summary>
    SystemLogColumnMapping GetColumnMapping();

    /// <summary>
    /// 配置 Entity Framework 的属性映射
    /// </summary>
    void ConfigurePropertyMapping(Microsoft.EntityFrameworkCore.ModelBuilder modelBuilder);

    /// <summary>
    /// 标准化实体数据（从数据库读取后转换）
    /// </summary>
    void NormalizeEntity(Entities.SystemLog log);

    /// <summary>
    /// 准备实体数据（保存到数据库前转换）
    /// </summary>
    void PrepareForSave(Entities.SystemLog log);
}

/// <summary>
/// 数据库列名映射配置
/// </summary>
public class SystemLogColumnMapping
{
    public string TableName { get; set; } = string.Empty;
    public string MessageColumn { get; set; } = string.Empty;
    public string TimestampColumn { get; set; } = "Timestamp";
    public string LevelColumn { get; set; } = "Level";
    public string PropertiesColumn { get; set; } = "Properties";
    public string ExceptionColumn { get; set; } = "Exception";
}
