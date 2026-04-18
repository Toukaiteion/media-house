namespace MediaHouse.Data.Entities;

public class PluginExecutionLog
{
    public int Id { get; set; }
    public string PluginKey { get; set; } = string.Empty;
    public string? PluginVersion { get; set; }
    public int? MediaId { get; set; }
    public string ExecutionType { get; set; } = string.Empty;
    public string? SourceDir { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? ErrorMessage { get; set; }
    public int ProgressPercent { get; set; } = 0;
    public string? CurrentStep { get; set; }
    public DateTime StartTime { get; set; } = DateTime.UtcNow;
    public DateTime? EndTime { get; set; }
    public int? DurationSeconds { get; set; }
    public string? MetadataOutput { get; set; }
    public string? CreatedFiles { get; set; }
    public string? Statistics { get; set; }
    public string? LogMessages { get; set; }
}
