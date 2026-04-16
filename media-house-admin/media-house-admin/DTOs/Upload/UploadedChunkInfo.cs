namespace MediaHouse.DTOs.Upload;

public class UploadedChunkInfo
{
    public int MaxUploadedIndex { get; set; }
    // 个数
    public int UploadedChunks { get; set; }
    // 大小
    public long UploadedSize { get; set; }
    public int[] MissingChunksInUploadedRange { get; set; } = [];
}