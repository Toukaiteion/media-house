namespace MediaHouse.DTOs;

public class CreateUploadRequest
{
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public int ChunkSize { get; set; } = 5 * 1024 * 1024; // 默认 5MB
}
