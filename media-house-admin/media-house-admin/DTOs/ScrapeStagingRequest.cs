namespace MediaHouse.DTOs;

public class ScrapeStagingRequest
{
    public string PluginKey { get; set; } = string.Empty;
    public string? PluginVersion { get; set; }
    public string? ConfigName { get; set; }
}
