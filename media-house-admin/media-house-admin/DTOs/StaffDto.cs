namespace MediaHouse.DTOs;

public class StaffDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? AvatarPath { get; set; }
    public string? RoleName { get; set; } // 饰演角色名，演员专用
    public int MediaCount { get; set; } // 关联的媒体数量
    public bool IsFavorited { get; set; } // 当前用户是否收藏了该演员
}
