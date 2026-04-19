namespace MediaHouse.DTOs;

public class StagingMediaDto
{
    public string Id { get; set; } = string.Empty;
    public string UploadTaskId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? OriginalTitle { get; set; }
    public int? Year { get; set; }
    public string? Studio { get; set; }
    public int? Runtime { get; set; }
    public string? Description { get; set; }
    public string VideoPath { get; set; } = string.Empty;
    public long VideoSize { get; set; }
    public string? PosterPath { get; set; }
    public string? FanartPath { get; set; }
    public string? ThumbPath { get; set; }
    public List<string>? Screenshots { get; set; }
    public List<string>? Tags { get; set; }
    public List<StaffItemDto>? Staff { get; set; }
    public int Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? PublishedAt { get; set; }
}
