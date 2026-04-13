namespace MediaHouse.DTOs;

public class UploadProgressDto
{
    public string UploadId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public long UploadedSize { get; set; }
    public int TotalChunks { get; set; }
    public int UploadedChunks { get; set; }
    public double Progress { get; set; }
    public string Status { get; set; } = string.Empty;
}
