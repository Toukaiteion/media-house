namespace MediaHouse.Data.Entities;

public class SystemLog
{
    public int Id { get; set; }
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public string Message { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public string? Properties { get; set; }      // JSON 格式的属性
    public string? Exception { get; set; }
    public string? RenderedMessage { get; set; }  // SQLite 使用此字段
}
