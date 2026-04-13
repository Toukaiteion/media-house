namespace MediaHouse.Data.Entities;

public class MediaImgs
{
    public int Id { get; set; }
    public int MediaId { get; set; }                         // 对应 media id
    public string UrlName { get; set; } = string.Empty;       // 例如 p300111.jpg
    public string Name { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;          // 文件路径 UNIQUE
    public string FileName { get; set; } = string.Empty;
    public string? Extension { get; set; }
    public string? Type { get; set; }                         // poster, thumb, fanart
    public int? Width { get; set; }
    public int? Height { get; set; }
    public long? SizeBytes { get; set; }
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties: media_imgs n:1 medias
    public Media? Media { get; set; }
}
