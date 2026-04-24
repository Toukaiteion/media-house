using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data.Adapters;

/// <summary>
/// SQLite 数据库的 SystemLog 适配器
/// SQLite 使用 RenderedMessage 字段存储日志消息
/// </summary>
public class SqliteSystemLogAdapter : ISystemLogAdapter
{
    private static readonly SystemLogColumnMapping _mapping = new()
    {
        TableName = "system_logs",
        MessageColumn = "RenderedMessage",
        TimestampColumn = "Timestamp",
        LevelColumn = "Level",
        PropertiesColumn = "Properties",
        ExceptionColumn = "Exception"
    };

    public SystemLogColumnMapping GetColumnMapping() => _mapping;

    public void ConfigurePropertyMapping(ModelBuilder modelBuilder)
    {
        // SQLite 使用 RenderedMessage 字段，忽略 Message 字段
        modelBuilder.Entity<SystemLog>()
            .Ignore(l => l.Message);     
    }

    public void NormalizeEntity(SystemLog log)
    {
        // SQLite 使用 RenderedMessage 字段，需要转换到 Message
        if (string.IsNullOrEmpty(log.Message) && !string.IsNullOrEmpty(log.RenderedMessage))
        {
            log.Message = log.RenderedMessage;
        }
    }

    public void PrepareForSave(SystemLog log)
    {
        // SQLite 需要 RenderedMessage 字段
        if (!string.IsNullOrEmpty(log.Message) && string.IsNullOrEmpty(log.RenderedMessage))
        {
            log.RenderedMessage = log.Message;
        }
    }
}
