namespace MediaHouse.Data.Entities;

public class Media
{
    public int Id { get; set; }
    public int LibraryId { get; set; }
    public string Type { get; set; } = string.Empty;          // movie, tvshow, season, episode
    public int ParentId { get; set; } = 0;                    // 默认0
    public string Name { get; set; } = string.Empty;          // 媒体名
    public string Title { get; set; } = string.Empty;         // 标题
    public string? OriginalTitle { get; set; }                // 原始标题
    public string? ReleaseDate { get; set; }                  // 上映日期 DATE
    public string? Summary { get; set; }                       // 简介 VARCHAR(4096)
    public string? PosterPath { get; set; }                   // 海报
    public string? ThumbPath { get; set; }                    // 缩略图
    public string? FanartPath { get; set; }                   // 粉丝图
    public int? PlayCount { get; set; }                        // 播放次数
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public MediaLibrary? Library { get; set; }
    public Media? Parent { get; set; }
    public ICollection<Media> Children { get; set; } = [];

    // medias 1:1 movies (通过MediaItemId关联)
    public Movie? Movie { get; set; }

    // medias 1:n media_files
    public ICollection<MediaFile> MediaFiles { get; set; } = [];

    // medias1:n media_imgs
    public ICollection<MediaImgs> MediaImgs { get; set; } = [];

    // medias n:m tags (通过MediaTag关联表)
    public ICollection<MediaTag> MediaTags { get; set; } = [];

    // medias n:m staff (通过MediaStaff关联表)
    public ICollection<MediaStaff> MediaStaffs { get; set; } = [];
}
