namespace MediaHouse.DTOs;

public class MergeResponse
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
    public MergeData? Data { get; set; }
    public int[]? MissingChunks { get; set; }
    public int UploadedChunksNum { get; set; }
}

public class MergeData
{
    public string MediaId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}
