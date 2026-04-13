namespace MediaHouse.DTOs;

public class ScreenshotDto
{
    public string UrlName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public int? Width { get; set; }
    public int? Height { get; set; }
    public long? SizeBytes { get; set; }
}
