namespace MediaHouse.Data.Entities;

public class MediaStaff
{
    public int Id { get; set; }
    public string MediaType { get; set; } = string.Empty;  // movie / tv_show / season / episode
    public int MediaId { get; set; }
    public int StaffId { get; set; }
    public string RoleType { get; set; } = string.Empty;   // director / actor / writer
    public string? RoleName { get; set; }                    // 饰演角色名（演员专用）
    public int SortOrder { get; set; } = 0;                  // 排序（主演靠前）
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Staff? Staff { get; set; }
}
