namespace MediaHouse.DTOs;

public class SystemLogDto
{
    public int Id { get; set; }
    public DateTime Timestamp { get; set; }
    public string Message { get; set; } = string.Empty;
    public string MessageTemplate { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public string? Properties { get; set; }    // JSON 格式的属性
    public string? Exception { get; set; }
    public string? SourceContext { get; set; }  // 类名/命名空间
    public string? MachineName { get; set; }
    public int? ThreadId { get; set; }
    public string? Application { get; set; }
}
