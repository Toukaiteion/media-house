namespace MediaHouse.DTOs;

public class ScrapeMetadataResponseDto
{
    public int ExecutionId { get; set; }
    public string Status { get; set; } = string.Empty;
    public string StagingMediaId { get; set; } = string.Empty;
}
