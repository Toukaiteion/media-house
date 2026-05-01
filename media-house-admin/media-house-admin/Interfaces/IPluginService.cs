using MediaHouse.Data.Entities;
using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IPluginService
{
    Task<List<Plugin>> GetAllPluginsAsync();
    Task<List<PluginWithVersionsDto>> GetPluginsGroupedByKeyAsync();
    Task<Plugin?> GetPluginByDbKeyAsync(string pluginKey, string? version = null);
    Task<Plugin?> GetPluginByDbIdAsync(int id);
    Task<Plugin> CreatePluginAsync(Plugin plugin);
    Task<Plugin?> UpdatePluginAsync(string pluginKey, string version, bool? isEnabled);
    Task<bool> DeletePluginAsync(string pluginKey, string version);
    Task<bool> PluginExistsAsync(string pluginKey, string version);
}
