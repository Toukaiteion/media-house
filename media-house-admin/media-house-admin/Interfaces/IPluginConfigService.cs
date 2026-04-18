using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IPluginConfigService
{
    Task<List<PluginConfig>> GetPluginConfigsAsync(string pluginKey);
    Task<PluginConfig?> GetPluginConfigAsync(int configId);
    Task<PluginConfig?> GetActiveConfigAsync(string pluginKey);
    Task<PluginConfig> CreateConfigAsync(PluginConfig config);
    Task<PluginConfig?> UpdateConfigAsync(PluginConfig config);
    Task<bool> DeleteConfigAsync(int configId);
    Task<bool> ConfigExistsAsync(string pluginKey, string configName);
}
