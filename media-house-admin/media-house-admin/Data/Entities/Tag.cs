namespace MediaHouse.Data.Entities;

public class Tag
{
    public int Id { get; set; }
    public string TagName { get; set; } = string.Empty;
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public ICollection<MediaTag> MediaTags { get; set; } = [];
}
