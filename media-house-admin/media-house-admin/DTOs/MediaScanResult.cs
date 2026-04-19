using MediaHouse.Data.Entities;

namespace MediaHouse.DTOs;

public class MediaScanResult
{
    public required Media Media { get; set; }
    public required Movie Movie { get; set; }
    public MediaFile? MediaFile { get; set; }
    public List<MediaImgs> MediaImages { get; set; } = new();
    public string? Tags { get; set; }      // 从 NFO 解析的 tags (逗号分隔字符串)
    public List<string>? Actors { get; set; }    // 从 NFO 解析的 actors
}
