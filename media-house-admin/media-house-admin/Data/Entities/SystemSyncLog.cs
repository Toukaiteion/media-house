namespace MediaHouse.Data.Entities;

public enum SyncType
{
    FullScan,
    IncrementalScan,
    FileChange,
    ManualSync
}

public enum SyncStatus
{
    Started,
    InProgress,
    Completed,
    Failed
}

public class SystemSyncLog
{
    public int Id { get; set; }
    public int MediaLibraryId { get; set; }
    public SyncType SyncType { get; set; } = SyncType.FullScan;
    public SyncStatus Status { get; set; } = SyncStatus.Started;
    public int? AddedCount { get; set; }
    public int? UpdatedCount { get; set; }
    public int? DeletedCount { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime StartTime { get; set; } = DateTime.UtcNow;
    public DateTime EndTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public MediaLibrary? MediaLibrary { get; set; }
}
