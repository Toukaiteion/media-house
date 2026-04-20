namespace MediaHouse.Data.Entities;

public class PluginExecutionLog
{
    public int Id { get; set; }
    public string PluginKey { get; set; } = string.Empty;
    public string? PluginVersion { get; set; }
    public int? BusinessId { get; set; }
    public PluginBusinessType? BusinessType { get; set; } // None, Staging, Media, Custom
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

    // Retry and config fields
    public int? ConfigId { get; set; }
    public int RetryCount { get; set; } = 0;
    public int MaxRetries { get; set; } = 3;
    public string? Input { get; set; }
    public DateTime? LastRetryTime { get; set; }
}
