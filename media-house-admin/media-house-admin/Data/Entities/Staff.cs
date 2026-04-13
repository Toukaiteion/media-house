namespace MediaHouse.Data.Entities;

public class Staff
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? AvatarPath { get; set; }
    public string? Country { get; set; }
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public ICollection<MediaStaff> MediaStaffs { get; set; } = [];
}
