namespace MediaHouse.Data.Entities;

public class MyFavor
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int LibraryId { get; set; }
    public string MediaType { get; set; } = string.Empty;    // movie / tv
    public int MediaId { get; set; }                           // media id
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public AppUser? User { get; set; }
}
