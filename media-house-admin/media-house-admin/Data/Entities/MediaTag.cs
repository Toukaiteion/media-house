namespace MediaHouse.Data.Entities;

public class MediaTag
{
    public int MediaLibraryId { get; set; }
    public string MediaType { get; set; } = string.Empty;
    public int MediaId { get; set; }
    public int TagId { get; set; }
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public MediaLibrary? MediaLibrary { get; set; }
    public Tag? Tag { get; set; }
}
