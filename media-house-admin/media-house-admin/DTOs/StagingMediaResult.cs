namespace MediaHouse.DTOs;

public class StagingMediaResult
{
    public bool Success { get; set; }
    public string? StagingMediaId { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
}
