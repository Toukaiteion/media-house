namespace MediaHouse.DTOs;

public class UpdateStagingMetadataRequest
{
    public string? Code { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? OriginalTitle { get; set; }
    public int? Year { get; set; }
    public string? ReleaseDate { get; set; }
    public string? Studio { get; set; }
    public int? Runtime { get; set; }
    public string? Description { get; set; }
    public string? PosterPath { get; set; }
    public string? ThumbPath { get; set; }
    public string? FanartPath { get; set; }
    public List<string>? ExtraFanartPaths { get; set; }
    public List<string>? Tags { get; set; }
    public List<StaffItemDto>? Staff { get; set; }
}
