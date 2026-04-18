using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class PluginConfigService(MediaHouseDbContext context, ILogger<PluginConfigService> logger) : IPluginConfigService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<PluginConfigService> _logger = logger;

    public async Task<List<PluginConfig>> GetPluginConfigsAsync(string pluginKey)
    {
        var query = _context.PluginConfigs.Where(p => p.PluginKey == pluginKey);
        return await query.ToListAsync();
    }

    public async Task<PluginConfig?> GetPluginConfigAsync(int configId)
    {
        return await _context.PluginConfigs.FindAsync(configId);
    }

    public async Task<PluginConfig?> GetActiveConfigAsync(string pluginKey)
    {
        var query = _context.PluginConfigs
            .Where(p => p.PluginKey == pluginKey && p.IsActive);
        return await query.FirstOrDefaultAsync();
    }

    public async Task<PluginConfig> CreateConfigAsync(PluginConfig config)
    {
        _context.PluginConfigs.Add(config);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created plugin config: {PluginKey} - {ConfigName}", config.PluginKey, config.ConfigName);

        return config;
    }

    public async Task<PluginConfig?> UpdateConfigAsync(PluginConfig config)
    {
        var existingConfig = await _context.PluginConfigs.FindAsync(config.Id);
        if (existingConfig == null) return null;

        existingConfig.PluginVersion = config.PluginVersion;
        existingConfig.ConfigName = config.ConfigName;
        existingConfig.ConfigData = config.ConfigData;
        existingConfig.IsActive = config.IsActive;
        existingConfig.UpdateTime = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated plugin config: {PluginKey} - {ConfigName}", config.PluginKey, config.ConfigName);

        return existingConfig;
    }

    public async Task<bool> DeleteConfigAsync(int configId)
    {
        var config = await _context.PluginConfigs.FindAsync(configId);
        if (config == null) return false;

        _context.PluginConfigs.Remove(config);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deleted plugin config: {ConfigId}", configId);

        return true;
    }

    public async Task<bool> ConfigExistsAsync(string pluginKey, string configName)
    {
        var query = _context.PluginConfigs
            .Where(p => p.PluginKey == pluginKey && p.ConfigName == configName);
        return await query.AnyAsync();
    }
}
