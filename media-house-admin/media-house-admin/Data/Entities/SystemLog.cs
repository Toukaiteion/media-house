namespace MediaHouse.Data.Entities;

public class SystemLog
{
    public int Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string RenderedMessage { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public string? Properties { get; set; }      // JSON 格式的属性
    public string? Exception { get; set; }
}
