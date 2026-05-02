namespace MediaHouse.Data.Entities;

public class StagingMedia
{
    public string Id { get; set; } = string.Empty;
    public string UploadTaskId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // movie, tvshow
    public string? Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? OriginalTitle { get; set; }
    public int? Year { get; set; }
    public string? ReleaseDate { get; set; }
    public string? Studio { get; set; }
    public int? Runtime { get; set; }
    public string? Description { get; set; }
    public string VideoPath { get; set; } = string.Empty;
    public long VideoSize { get; set; }
    public string? PosterPath { get; set; }
    public string? FanartPath { get; set; }
    public string? ThumbPath { get; set; }
    public string? ScreenshotsPath { get; set; }
    public string? Tags { get; set; } // JSON array
    public string? Staff { get; set; } // JSON array
    public string? FolderId { get; set; } // 所属文件夹上传任务ID
    public string? RelativePath { get; set; } // 原始相对路径
    public int Status { get; set; } // 0=待编辑，1=待发布，2=已发布
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAt { get; set; }

    // Navigation property
    public UploadTask? UploadTask { get; set; }
}
