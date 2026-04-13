namespace MediaHouse.Data.Entities;

public class Plugin
{
    public int Id { get; set; }
    public string PluginKey { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Author { get; set; }
    public string? Homepage { get; set; }
    public string EntryPoint { get; set; } = "bin/scraper";
    public string SupportedMediaTypes { get; set; } = "movie";
    public string SupportedLanguages { get; set; } = "zh-CN";
    public string PluginDir { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public bool IsInstalled { get; set; } = true;
    public string? ConfigSchema { get; set; }
    public string? RuntimeRequirements { get; set; }
    public DateTime CreateTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdateTime { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public ICollection<PluginConfig> PluginConfigs { get; set; } = [];
}
