using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IPluginConfigService
{
    Task<List<PluginConfig>> GetPluginConfigsAsync(string pluginKey, int? libraryId = null);
    Task<PluginConfig?> GetPluginConfigAsync(int configId);
    Task<PluginConfig?> GetActiveConfigAsync(string pluginKey, int? libraryId = null);
    Task<PluginConfig> CreateConfigAsync(PluginConfig config);
    Task<PluginConfig?> UpdateConfigAsync(PluginConfig config);
    Task<bool> DeleteConfigAsync(int configId);
    Task<bool> ConfigExistsAsync(string pluginKey, int? libraryId, string configName);
}
