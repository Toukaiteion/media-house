using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data.Adapters;

/// <summary>
/// MySQL 数据库的 SystemLog 适配器
/// MySQL 使用 Message 字段存储日志消息
/// </summary>
public class MySqlSystemLogAdapter : ISystemLogAdapter
{
    private static readonly SystemLogColumnMapping _mapping = new()
    {
        TableName = "system_logs",
        MessageColumn = "Message",
        TimestampColumn = "Timestamp",
        LevelColumn = "Level",
        PropertiesColumn = "Properties",
        ExceptionColumn = "Exception"
    };

    public SystemLogColumnMapping GetColumnMapping() => _mapping;

    public void ConfigurePropertyMapping(ModelBuilder modelBuilder)
    {
        // MySQL 使用 Message 字段，忽略 RenderedMessage 字段
        modelBuilder.Entity<SystemLog>()
            .Ignore(l => l.RenderedMessage);

        modelBuilder.Entity<SystemLog>()
            .Property(l => l.Timestamp)
            .HasConversion(
                v => v.ToString("yyyy-MM-dd HH:mm:ss.ffffffzzz"),
                v => DateTimeOffset.Parse(v)
            );
    }

    public void NormalizeEntity(SystemLog log)
    {
        // MySQL 使用 Message 字段，无需转换
        if (string.IsNullOrEmpty(log.Message) && !string.IsNullOrEmpty(log.RenderedMessage))
        {
            log.Message = log.RenderedMessage;
        }
    }

    public void PrepareForSave(SystemLog log)
    {
        // 确保使用 Message 字段
        if (!string.IsNullOrEmpty(log.RenderedMessage) && string.IsNullOrEmpty(log.Message))
        {
            log.Message = log.RenderedMessage;
        }
    }
}
