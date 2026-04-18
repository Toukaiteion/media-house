namespace MediaHouse.Config;

public class PluginSettings
{
    public string PluginPath { get; set; } = "workspace/plugins";
    public List<string> EnabledPlugins { get; set; } = [];
}