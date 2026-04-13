namespace MediaHouse.DTOs;

public class UpdateStagingMetadataRequest
{
    public string Title { get; set; } = string.Empty;
    public string? OriginalTitle { get; set; }
    public int? Year { get; set; }
    public string? Studio { get; set; }
    public int? Runtime { get; set; }
    public string? Description { get; set; }
    public List<string>? Tags { get; set; }
    public List<StaffItemDto>? Staff { get; set; }
}
