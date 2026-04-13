namespace MediaHouse.DTOs;

public class MovieDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int? Year { get; set; }
    public string? PosterPath { get; set; }
    public string? ThumbPath { get; set; }
    public string? FanartPath { get; set; }
    public string? Overview { get; set; }
    public DateTime CreatedAt { get; set; }
    public string MediaLibraryId { get; set; } = string.Empty;
    public int? PlayCount { get; set; }  // 播放次数
    public bool IsFavorited { get; set; }  // 是否喜欢
}
