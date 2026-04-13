using System.ComponentModel.DataAnnotations.Schema;

namespace MediaHouse.Data.Entities;

public class MediaFile
{
    public int Id { get; set; }

    [ForeignKey("MediaId")]
    public int MediaId { get; set; }                         // 对应 media id
    public string Path { get; set; } = string.Empty;          // 文件路径 UNIQUE
    public string FileName { get; set; } = string.Empty;
    public string? Extension { get; set; }
    public string? Container { get; set; }                   // // mkv, mp4...
    public string? VideoCodec { get; set; }
    public int? Runtime { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public string? AudioCodec { get; set; }
    public long? SizeBytes { get; set; }
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties: media_files n:1 medias
    public Media? Media { get; set; }
}
