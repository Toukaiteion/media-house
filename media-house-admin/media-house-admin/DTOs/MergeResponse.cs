namespace MediaHouse.DTOs;

public class MergeResponse
{
    public bool success { get; set; }
    public string? error { get; set; }
    public string? message { get; set; }
    public MergeData? data { get; set; }
    public int[]? missing_chunks { get; set; }
}

public class MergeData
{
    public string media_id { get; set; } = string.Empty;
    public string status { get; set; } = string.Empty;
}
