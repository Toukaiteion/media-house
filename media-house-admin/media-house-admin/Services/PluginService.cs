using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using MediaHouse.DTOs;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class PluginService(MediaHouseDbContext context, ILogger<PluginService> logger) : IPluginService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<PluginService> _logger = logger;

    public async Task<List<Plugin>> GetAllPluginsAsync()
    {
        return await _context.Plugins
            .OrderByDescending(p => p.CreateTime)
            .ToListAsync();
    }

    public async Task<Plugin?> GetPluginByDbKeyAsync(string pluginKey, string? version = null)
    {
        var query = _context.Plugins.Where(p => p.PluginKey == pluginKey);

        if (version != null)
        {
            query = query.Where(p => p.Version == version);
        }
        else
        {
            // Return latest version
            query = query.OrderByDescending(p => p.Version);
        }

        return await query.FirstOrDefaultAsync();
    }

    public async Task<Plugin?> GetPluginByDbIdAsync(int id)
    {
        return await _context.Plugins.FindAsync(id);
    }

    public async Task<Plugin> CreatePluginAsync(Plugin plugin)
    {
        _context.Plugins.Add(plugin);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created plugin: {PluginKey} version {Version}", plugin.PluginKey, plugin.Version);

        return plugin;
    }

    public async Task<Plugin?> UpdatePluginAsync(string pluginKey, string version, bool? isEnabled)
    {
        var plugin = await _context.Plugins
            .FirstOrDefaultAsync(p => p.PluginKey == pluginKey && p.Version == version);

        if (plugin == null) return null;

        if (isEnabled.HasValue)
        {
            plugin.IsEnabled = isEnabled.Value;
        }

        plugin.UpdateTime = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated plugin: {PluginKey} version {Version}", pluginKey, version);

        return plugin;
    }

    public async Task<bool> DeletePluginAsync(string pluginKey, string version)
    {
        var plugin = await _context.Plugins
            .FirstOrDefaultAsync(p => p.PluginKey == pluginKey && p.Version == version);

        if (plugin == null) return false;

        // Delete plugin directory if it exists
        if (Directory.Exists(plugin.PluginDir))
        {
            try
            {
                Directory.Delete(plugin.PluginDir, true);
                _logger.LogInformation("Deleted plugin directory: {PluginDir}", plugin.PluginDir);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete plugin directory: {PluginDir}", plugin.PluginDir);
            }
        }

        _context.Plugins.Remove(plugin);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deleted plugin: {PluginKey} version {Version}", pluginKey, version);

        return true;
    }

    public async Task<bool> PluginExistsAsync(string pluginKey, string version)
    {
        return await _context.Plugins
            .AnyAsync(p => p.PluginKey == pluginKey && p.Version == version);
    }

    public async Task<List<PluginWithVersionsDto>> GetPluginsGroupedByKeyAsync()
    {
        var allPlugins = await _context.Plugins
            .OrderByDescending(p => p.Version)
            .ToListAsync();

        var grouped = allPlugins
            .GroupBy(p => p.PluginKey)
            .Select(g => new PluginWithVersionsDto
            {
                PluginKey = g.Key,
                Name = g.First().Name,
                Description = g.First().Description,
                Author = g.First().Author,
                Homepage = g.First().Homepage,
                Versions = g.Select(p => new PluginVersionDto
                {
                    Id = p.Id,
                    Version = p.Version
                }).OrderByDescending(v => v.Version).ToList()
            })
            .OrderBy(p => p.Name)
            .ToList();

        return grouped;
    }
}
