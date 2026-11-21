namespace MediaHouse.Data.Entities;

/// <summary>
/// 用户收藏的演员。
/// 和 MyFavor（收藏影片）分开存：MyFavor 被影片列表的 favor 过滤直接依赖，不适合塞进其他收藏类型。
/// </summary>
public class FavoriteStaff
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int StaffId { get; set; }
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
}
