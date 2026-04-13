namespace MediaHouse.Data.Entities;

public class PlayRecord
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int LibraryId { get; set; }
    public string MediaType { get; set; } = string.Empty;
    public int MediaId { get; set; }                           // media id
    public long PositionMs { get; set; } = 0;                   // 播放进度（毫秒）
    public bool IsFinished { get; set; } = false;
    public DateTime? LastPlayTime { get; set; }
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public AppUser? User { get; set; }
}
