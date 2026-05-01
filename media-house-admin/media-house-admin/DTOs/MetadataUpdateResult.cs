namespace MediaHouse.DTOs;

public class MetadataUpdateResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public int MediaId { get; set; }
    public string? Title { get; set; }
}