namespace MediaHouse.DTOs;

public class ScanLogDto
{
    public int Id { get; set; }
    public int MediaLibraryId { get; set; }
    public string SyncType { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int AddedCount { get; set; }
    public int UpdatedCount { get; set; }
    public int DeletedCount { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public string? ErrorMessage { get; set; }
}

public class ScanProgressDto
{
    public string MediaLibraryId { get; set; } = string.Empty;
    public int ProcessedFiles { get; set; }
    public int TotalFiles { get; set; }
    public double Percentage { get; set; }
    public string CurrentFile { get; set; } = string.Empty;
}
