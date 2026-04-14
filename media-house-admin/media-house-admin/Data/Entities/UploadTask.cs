namespace MediaHouse.Data.Entities;

public class UploadTask
{
    public string Id { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string? FileMd5 { get; set; }
    public int ChunkSize { get; set; }
    public int TotalChunks { get; set; }
    public int UploadedChunks { get; set; }
    public long UploadedSize { get; set; }
    public int Status { get; set; } // 0=待上传，1=上传中，2=已完成，3=已取消，4=失败
    public string? MimeType { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
}
