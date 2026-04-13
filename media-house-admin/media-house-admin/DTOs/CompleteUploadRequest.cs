namespace MediaHouse.DTOs;

public class CompleteUploadRequest
{
    public string Type { get; set; } = string.Empty; // movie, tvshow
    public string Title { get; set; } = string.Empty;
}
