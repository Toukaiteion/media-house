namespace MediaHouse.Data.Entities;

public class PluginConfig
{
    public int Id { get; set; }
    public int PluginId { get; set; }
    public string PluginKey { get; set; } = string.Empty;
    public string? PluginVersion { get; set; }
    public string ConfigName { get; set; } = "default";
    public string ConfigData { get; set; } = string.Empty;
    public bool IsActive { get; set; } = false;
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;
}
