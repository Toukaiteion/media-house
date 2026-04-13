namespace MediaHouse.DTOs;

public class MediaRecommendationQueryDto
{
    public int TagNum { get; set; } = 5;  // Default: top 5 tags/actors
    public int MediaNum { get; set; } = 3; // Default: 3 movies per tag/actor
    public string MediaSearchType { get; set; } = "create_time"; // "create_time" or "random"
}
