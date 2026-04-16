namespace MediaHouse.DTOs;

public class UploadTaskDto
{
    public string UploadId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string FileMd5 { get; set; } = string.Empty;
    public int ChunkSize { get; set; }
    public int TotalChunks { get; set; }
    public int UploadedChunks { get; set; }
    public long UploadedSize { get; set; }
    public int MaxUploadedChunkIndex { get; set; }
    public int[] MissingChunksInUploadedRange { get; set; } = [];
    public double Progress { get; set; }
    public string Status { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
    public string? UpdatedAt { get; set; }
    public bool IsNew { get; set; }
}
