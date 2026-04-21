namespace MediaHouse.DTOs;

public class EventIdDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class SystemLogDto
{
    public int Id { get; set; }
    public DateTime Timestamp { get; set; }
    public string Message { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public string? KeyId { get; set; }
    public EventIdDto? EventId { get; set; }
    public string? SourceContext { get; set; }
    public string? MachineName { get; set; }
    public int? ThreadId { get; set; }
    public string? Application { get; set; }
    public string? Exception { get; set; }
}
