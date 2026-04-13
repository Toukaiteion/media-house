using System.ComponentModel.DataAnnotations.Schema;

namespace MediaHouse.Data.Entities;

public class Movie
{
    public int Id { get; set; }

    [ForeignKey("MediaId")]
    public int MediaId { get; set; }

    public int LibraryId { get; set; }
    public string? Num { get; set; }                        // 编号/排序号
    public string? Studio { get; set; }                      // 制片公司/工作室
    public string? Maker { get; set; }                       // 制作公司
    public int? Runtime { get; set; }                        // 时长(分钟)
    public string? Description { get; set; }                  // 详细描述
    public string? ScreenshotsPath { get; set; }             // 截图路径
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties: movies 1:1 medias
    public Media? Media { get; set; }
}
