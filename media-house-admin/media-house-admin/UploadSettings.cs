namespace MediaHouse;

public class UploadSettings
{
    public int ChunkSize { get; set; } = 5 * 1024 * 1024; // 5MB
    public long MaxFileSize { get; set; } = 10L * 1024 * 1024 * 1024; // 10GB
    public string UploadPath { get; set; } = "upload-area/uploads";
    public string StagingPath { get; set; } = "upload-area/staging";
    public int TempFileRetentionDays { get; set; } = 7;
    public int MaxConcurrentUploads { get; set; } = 5;
    public List<string> AllowedExtensions { get; set; } = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm"];
}
