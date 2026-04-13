namespace MediaHouse.DTOs;

public class UploadTaskDto
{
    public string UploadId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public int TotalChunks { get; set; }
    public string Status { get; set; } = string.Empty;
}
