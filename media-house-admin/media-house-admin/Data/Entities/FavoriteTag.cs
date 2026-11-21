namespace MediaHouse.Data.Entities;

/// <summary>
/// 用户收藏的标签。
/// </summary>
public class FavoriteTag
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int TagId { get; set; }
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
}
