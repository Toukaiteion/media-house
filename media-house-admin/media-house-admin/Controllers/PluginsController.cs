using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using System.Text.Json;
using MediaHouse.Services;
using MediaHouse.Config;
using Microsoft.Extensions.Options;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PluginsController(
    IPluginService pluginService,
    IPluginConfigService pluginConfigService,
    IPluginExecutionService pluginExecutionService,
    ILogger<PluginsController> logger,
    IOptions<PluginSettings> pluginSettings) : ControllerBase
{
    private readonly IPluginService _pluginService = pluginService;
    private readonly IPluginConfigService _pluginConfigService = pluginConfigService;
    private readonly IPluginExecutionService _pluginExecutionService = pluginExecutionService;
    private readonly ILogger<PluginsController> _logger = logger;

    private readonly PluginSettings _pluginSettings = pluginSettings.Value;

    // GET /api/plugins
    [HttpGet]
    public async Task<ActionResult<List<PluginDto>>> GetPlugins()
    {
        try
        {
            var plugins = await _pluginService.GetAllPluginsAsync();
            var dtos = plugins.Select(MapToDto).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching plugins");
            return StatusCode(500, new { error = "Failed to fetch plugins" });
        }
    }

    // GET /api/plugins/{pluginKey}
    [HttpGet("{pluginKey}")]
    public async Task<ActionResult<PluginDto>> GetPlugin(string pluginKey, [FromQuery] string? version = null)
    {
        try
        {
            var plugin = await _pluginService.GetPluginByDbKeyAsync(pluginKey, version);
            if (plugin == null)
            {
                return NotFound(new { error = "Plugin not found" });
            }
            return Ok(MapToDto(plugin));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching plugin {PluginKey}", pluginKey);
            return StatusCode(500, new { error = "Failed to fetch plugin" });
        }
    }

    // POST /api/plugins/install
    [HttpPost("install")]
    [RequestSizeLimit(100 * 1024 * 1024)] // 100MB limit
    public async Task<ActionResult<InstallPluginResponseDto>> InstallPlugin([FromForm] IFormFile file)
    {
        try
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { error = "No file uploaded" });
            }

            // Ensure plugins directory exists
            if (!Directory.Exists(_pluginSettings.PluginPath))
            {
                Directory.CreateDirectory(_pluginSettings.PluginPath);
            }

            // Install plugin
            var installer = new PluginInstaller(_logger);
            var result = await installer.InstallAsync(file.OpenReadStream(), _pluginSettings.PluginPath);

            if (!result.Success)
            {
                return BadRequest(new { error = result.ErrorMessage });
            }

            // Create plugin record in database
            var plugin = new Plugin
            {
                PluginKey = result.PluginKey!,
                Version = result.Version!,
                PluginDir = result.PluginDir!,
                IsEnabled = true,
                IsInstalled = true,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };

            // Load plugin.json to get additional info
            var pluginJsonPath = Path.Combine(result.PluginDir!, "plugin.json");
            if (System.IO.File.Exists(pluginJsonPath))
            {
                var pluginDef = ParsePluginJson(pluginJsonPath);
                plugin.Name = pluginDef.Name;
                plugin.Description = pluginDef.Description;
                plugin.Author = pluginDef.Author;
                plugin.Homepage = pluginDef.Homepage;
                plugin.EntryPoint = pluginDef.EntryPoint;
                plugin.SupportedMediaTypes = string.Join(",", pluginDef.SupportedMediaTypes);
                plugin.SupportedLanguages = string.Join(",", pluginDef.SupportedLanguages);
                plugin.ConfigSchema = pluginDef.ConfigSchema?.ToString();
                plugin.RuntimeRequirements = pluginDef.RuntimeRequirements?.ToString();
            }

            await _pluginService.CreatePluginAsync(plugin);

            var response = new InstallPluginResponseDto
            {
                PluginKey = result.PluginKey!,
                Version = result.Version!,
                PluginDir = result.PluginDir!
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error installing plugin");
            return StatusCode(500, new { error = "Failed to install plugin" });
        }
    }

    // PUT /api/plugins/{pluginKey}
    [HttpPut("{pluginKey}")]
    public async Task<ActionResult<PluginDto>> UpdatePlugin(string pluginKey, [FromQuery] string version, [FromBody] UpdatePluginRequestDto dto)
    {
        try
        {
            var plugin = await _pluginService.UpdatePluginAsync(pluginKey, version, dto.IsEnabled);
            if (plugin == null)
            {
                return NotFound(new { error = "Plugin not found" });
            }
            return Ok(MapToDto(plugin));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating plugin {PluginKey}", pluginKey);
            return StatusCode(500, new { error = "Failed to update plugin" });
        }
    }

    // DELETE /api/plugins/{pluginKey}?version={version}
    [HttpDelete("{pluginKey}")]
    public async Task<ActionResult> DeletePlugin(string pluginKey, [FromQuery] string version)
    {
        try
        {
            var success = await _pluginService.DeletePluginAsync(pluginKey, version);
            if (!success)
            {
                return NotFound(new { error = "Plugin not found" });
            }
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting plugin {PluginKey}", pluginKey);
            return StatusCode(500, new { error = "Failed to delete plugin" });
        }
    }

    // GET /api/plugins/{pluginKey}/configs
    [HttpGet("{pluginKey}/configs")]
    public async Task<ActionResult<List<PluginConfigDto>>> GetPluginConfigs(string pluginKey)
    {
        try
        {
            var configs = await _pluginConfigService.GetPluginConfigsAsync(pluginKey);
            var dtos = configs.Select(MapToConfigDto).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching plugin configs for {PluginKey}", pluginKey);
            return StatusCode(500, new { error = "Failed to fetch plugin configs" });
        }
    }

    // POST /api/plugins/{pluginKey}/configs
    [HttpPost("{pluginKey}/configs")]
    public async Task<ActionResult<PluginConfigDto>> CreatePluginConfig(string pluginKey, [FromBody] CreatePluginConfigRequestDto dto)
    {
        try
        {
            // Check if plugin exists
            var plugin = await _pluginService.GetPluginByDbKeyAsync(pluginKey, dto.PluginVersion);
            if (plugin == null)
            {
                return NotFound(new { error = "Plugin not found" });
            }

            // Check if config already exists
            if (await _pluginConfigService.ConfigExistsAsync(pluginKey, dto.ConfigName))
            {
                return BadRequest(new { error = "Config with this name already exists" });
            }

            var config = new PluginConfig
            {
                PluginId = plugin.Id,
                PluginKey = pluginKey,
                PluginVersion = dto.PluginVersion,
                ConfigName = dto.ConfigName,
                ConfigData = dto.ConfigData.GetRawText(),
                IsActive = dto.IsActive,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };

            await _pluginConfigService.CreateConfigAsync(config);
            return CreatedAtAction(nameof(GetPluginConfigs), new { pluginKey }, MapToConfigDto(config));
        }
        catch (Exception ex)
        {
                       _logger.LogError(ex, "Error creating plugin config for {PluginKey}", pluginKey);
            return StatusCode(500, new { error = "Failed to create plugin config" });
        }
    }

    // PUT /api/plugins/{pluginKey}/configs/{configId}
    [HttpPut("{pluginKey}/configs/{configId}")]
    public async Task<ActionResult<PluginConfigDto>> UpdatePluginConfig(string pluginKey, int configId, [FromBody] UpdatePluginConfigRequestDto dto)
    {
        try
        {
            var existingConfig = await _pluginConfigService.GetPluginConfigAsync(configId);
            if (existingConfig == null)
            {
                return NotFound(new { error = "Config not found" });
            }

            if (existingConfig.PluginKey != pluginKey)
            {
                return BadRequest(new { error = "Config does not belong to this plugin" });
            }
            if (dto.ConfigName != null)
            {
                existingConfig.ConfigName = dto.ConfigName;
            }
            if (dto.ConfigData.HasValue)
            {
                existingConfig.ConfigData = dto.ConfigData.Value.GetRawText();
            }
            if (dto.IsActive.HasValue)
            {
                existingConfig.IsActive = dto.IsActive.Value;
            }
            existingConfig.UpdateTime = DateTime.UtcNow;

            var updated = await _pluginConfigService.UpdateConfigAsync(existingConfig);
            if (updated == null)
            {
                return StatusCode(500, new { error = "Failed to update config" });
            }

            return Ok(MapToConfigDto(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating plugin config {ConfigId}", configId);
            return StatusCode(500, new { error = "Failed to update plugin config" });
        }
    }

    // DELETE /api/plugins/{pluginKey}/configs/{configId}
    [HttpDelete("{pluginKey}/configs/{configId}")]
    public async Task<ActionResult> DeletePluginConfig(string pluginKey, int configId)
    {
        try
        {
            var success = await _pluginConfigService.DeleteConfigAsync(configId);
            if (!success)
            {
                return NotFound(new { error = "Config not found" });
            }
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting plugin config {ConfigId}", configId);
            return StatusCode(500, new { error = "Failed to delete plugin config" });
        }
    }

    // POST /api/plugins/{pluginKey}/execute
    [HttpPost("{pluginKey}/execute")]
    public async Task<ActionResult<ExecutePluginResponseDto>> ExecutePlugin(string pluginKey, [FromBody] ExecutePluginRequestDto dto)
    {
        try
        {
            var log = await _pluginExecutionService.ExecutePluginAsync(
                pluginKey,
                dto.SourceDir,
                outputDir: dto.OutputDir,
                dto.ConfigName,
                dto.PluginVersion,
                businessType: PluginBusinessType.Media
            );

            var response = new ExecutePluginResponseDto
            {
                ExecutionId = log.Id,
                Status = log.Status
            };

            return Accepted(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing plugin {PluginKey}", pluginKey);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // POST /api/plugins/{pluginKey}/execute-batch
    [HttpPost("{pluginKey}/execute-batch")]
    public async Task<ActionResult<ExecutePluginBatchResponseDto>> ExecutePluginBatch(string pluginKey, [FromBody] ExecutePluginBatchRequestDto dto)
    {
        try
        {
            var logs = await _pluginExecutionService.ExecuteBatchPluginAsync(
                pluginKey,
                dto.LibraryId,
                dto.MediaIds,
                dto.ConfigName,
                dto.PluginVersion,
                businessType: PluginBusinessType.Media
            );

            var response = new ExecutePluginBatchResponseDto
            {
                Total = logs.Count,
                ExecutionIds = logs.Select(l => l.Id).ToList()
            };

            return Accepted(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing batch plugin {PluginKey}", pluginKey);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // GET /api/plugins/execution/{executionId}
    [HttpGet("execution/{executionId}")]
    public async Task<ActionResult<PluginExecutionLogDto>> GetExecutionStatus(int executionId)
    {
        try
        {
            var log = await _pluginExecutionService.GetExecutionLogAsync(executionId);
            if (log == null)
            {
                return NotFound(new { error = "Execution not found" });
            }
            return Ok(MapToExecutionLogDto(log));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching execution status {ExecutionId}", executionId);
            return StatusCode(500, new { error = "Failed to fetch execution status" });
        }
    }

    // GET /api/plugins/{pluginKey}/logs
    [HttpGet("{pluginKey}/logs")]
    public async Task<ActionResult<List<PluginExecutionLogDto>>> GetPluginLogs(string pluginKey, [FromQuery] int? mediaId = null, [FromQuery] int limit = 10)
    {
        try
        {
            var logs = await _pluginExecutionService.GetPluginLogsAsync(pluginKey, mediaId, limit);
            var dtos = logs.Select(MapToExecutionLogDto).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching plugin logs for {PluginKey}", pluginKey);
            return StatusCode(500, new { error = "Failed to fetch plugin logs" });
        }
    }

    // DELETE /api/plugins/execution/{executionId}
    [HttpDelete("execution/{executionId}")]
    public async Task<ActionResult> CancelExecution(int executionId)
    {
        try
        {
            var success = await _pluginExecutionService.CancelExecutionAsync(executionId);
            if (!success)
            {
                return NotFound(new { error = "Execution not found or already completed" });
            }
            return Ok(new { message = "Execution cancelled" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cancelling execution {ExecutionId}", executionId);
            return StatusCode(500, new { error = "Failed to cancel execution" });
        }
    }

    private static PluginDto MapToDto(Plugin plugin)
    {
        var mediaTypes = string.IsNullOrEmpty(plugin.SupportedMediaTypes)
            ? []
            : plugin.SupportedMediaTypes.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();

        var languages = string.IsNullOrEmpty(plugin.SupportedLanguages)
            ? []
            : plugin.SupportedLanguages.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();

        return new PluginDto
        {
            Id = plugin.Id,
            PluginKey = plugin.PluginKey,
            Version = plugin.Version,
            Name = plugin.Name,
            Description = plugin.Description,
            Author = plugin.Author,
            Homepage = plugin.Homepage,
            IsEnabled = plugin.IsEnabled,
            IsInstalled = plugin.IsInstalled,
            SupportedMediaTypes = mediaTypes,
            SupportedLanguages = languages,
            ConfigSchema = !string.IsNullOrEmpty(plugin.ConfigSchema) ? JsonDocument.Parse(plugin.ConfigSchema).RootElement : null,
            RuntimeRequirements = !string.IsNullOrEmpty(plugin.RuntimeRequirements) ? JsonDocument.Parse(plugin.RuntimeRequirements).RootElement : null,
            CreateTime = plugin.CreateTime
        };
    }

    private static PluginConfigDto MapToConfigDto(PluginConfig config)
    {
        return new PluginConfigDto
        {
            Id = config.Id,
            PluginKey = config.PluginKey,
            PluginVersion = config.PluginVersion,
            ConfigName = config.ConfigName,
            ConfigData = JsonDocument.Parse(config.ConfigData).RootElement,
            IsActive = config.IsActive,
            CreateTime = config.CreateTime,
            UpdateTime = config.UpdateTime
        };
    }

    private static PluginExecutionLogDto MapToExecutionLogDto(PluginExecutionLog log)
    {
        return new PluginExecutionLogDto
        {
            Id = log.Id,
            PluginKey = log.PluginKey,
            PluginVersion = log.PluginVersion,
            BusinessId = log.BusinessId,
            ExecutionType = log.ExecutionType,
            SourceDir = log.SourceDir,
            Status = log.Status,
            ErrorMessage = log.ErrorMessage,
            LogMessages = log.LogMessages,
            ProgressPercent = log.ProgressPercent,
            CurrentStep = log.CurrentStep,
            StartTime = log.StartTime,
            EndTime = log.EndTime,
            DurationSeconds = log.DurationSeconds,
            MetadataOutput = !string.IsNullOrEmpty(log.MetadataOutput) ? JsonDocument.Parse(log.MetadataOutput).RootElement : null,
            CreatedFiles = !string.IsNullOrEmpty(log.CreatedFiles) ? JsonDocument.Parse(log.CreatedFiles).RootElement : null,
            Statistics = !string.IsNullOrEmpty(log.Statistics) ? JsonDocument.Parse(log.Statistics).RootElement : null
        };
    }

    private static PluginDefinition ParsePluginJson(string jsonPath)
    {
        var jsonContent = System.IO.File.ReadAllText(jsonPath);
        var jsonDoc = JsonDocument.Parse(jsonContent);
        var root = jsonDoc.RootElement;

        return new PluginDefinition
        {
            Id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "",
            Name = root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "" : "",
            Version = root.TryGetProperty("version", out var verProp) ? verProp.GetString() ?? "" : "",
            Description = root.TryGetProperty("description", out var descProp) ? descProp.GetString() : null,
            Author = root.TryGetProperty("author", out var authorProp) ? authorProp.GetString() : null,
            Homepage = root.TryGetProperty("homepage", out var homeProp) ? homeProp.GetString() : null,
            EntryPoint = root.TryGetProperty("entry_point", out var entryProp) ? entryProp.GetString() ?? "bin/scraper" : "bin/scraper",
            SupportedMediaTypes = ParseStringArray(root, "supported_media_types"),
            SupportedLanguages = ParseStringArray(root, "supported_languages"),
            SupportedIdentifiers = ParseStringArray(root, "supported_identifiers"),
            ConfigSchema = root.TryGetProperty("config_schema", out var configProp) ? configProp : null,
            RuntimeRequirements = root.TryGetProperty("runtime_requirements", out var reqProp) ? reqProp : null
        };
    }

    private static List<string> ParseStringArray(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var prop) || prop.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var result = new List<string>();
        foreach (var item in prop.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                result.Add(item.GetString() ?? "");
            }
        }
        return result;
    }
}
