namespace MediaHouse.Data.Entities;

public enum LibraryType
{
    Movie,
    TVShow
}

public enum ScanStatus
{
    Idle,
    Scanning,
    Error
}

public class MediaLibrary
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;         // 库名 VARCHAR(100)
    public LibraryType Type { get; set; } = LibraryType.Movie;          // movie / tv
    public string Path { get; set; } = string.Empty;         // 库路径 VARCHAR(500)
    public ScanStatus? Status { get; set; }                      // 扫描状态
    public bool IsEnabled { get; set; } = true;
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties: media_libraries 1:n medias
    public ICollection<Media> Medias { get; set; } = [];
}
