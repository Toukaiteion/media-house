namespace MediaHouse.DTOs;

public class MovieDetailDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? OriginalTitle { get; set; }
    public int? Year { get; set; }
    public string? ReleaseDate { get; set; }
    public string? PosterPath { get; set; }
    public string? ThumbPath { get; set; }
    public string? FanartPath { get; set; }
    public string? Overview { get; set; }
    public DateTime CreatedAt { get; set; }
    public string MediaLibraryId { get; set; } = string.Empty;

    // File info
    public string? FilePath { get; set; }
    public string? ContainerFormat { get; set; }
    public int? Duration { get; set; } // 分钟
    public long? FileSize { get; set; }

    // Movie specific info
    public string? Num { get; set; } // 编号
    public string? Studio { get; set; } // 制片公司
    public string? Maker { get; set; } // 制作公司
    public bool IsFavorited { get; set; } // 是否喜欢

    // Collections
    public List<ScreenshotDto> Screenshots { get; set; } = [];
    public List<StaffDto> Actors { get; set; } = [];
    public List<StaffDto> Directors { get; set; } = [];
    public List<StaffDto> Writers { get; set; } = [];
    public List<TagDto> Tags { get; set; } = [];
}
