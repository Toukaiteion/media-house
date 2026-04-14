namespace MediaHouse.DTOs;

public class CheckChunksResponse
{
    public bool success { get; set; }
    public CheckChunksData? data { get; set; }
    public string? error { get; set; }
}

public class CheckChunksData
{
    public string upload_id { get; set; } = string.Empty;
    public int from_index { get; set; }
    public int to_index { get; set; }
    public bool all_uploaded { get; set; }
    public int[] missing_chunks { get; set; } = [];
}
