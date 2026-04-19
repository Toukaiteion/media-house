using MediaHouse.Data.Entities;

namespace MediaHouse.DTOs;

public class MediaScanResult
{
    public required Media Media { get; set; }
    public required Movie Movie { get; set; }
    public MediaFile? MediaFile { get; set; }
    public List<MediaImgs> MediaImages { get; set; } = new();
}
