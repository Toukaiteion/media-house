namespace MediaHouse.DTOs;

public class FavorDto
{
    public string MediaId { get; set; } = string.Empty;
    public string MediaTitle { get; set; } = string.Empty;
    public string? PosterPath { get; set; }
    public DateTime CreatedAt { get; set; }
}
