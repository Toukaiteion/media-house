
using System.Text.Json;

namespace MediaHouse.DTOs;

public enum PluginMessageType
{
    Progress,
    Error
}

public class PluginDto
{
    public int Id { get; set; }
    public string PluginKey { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Author { get; set; }
    public string? Homepage { get; set; }
    public bool IsEnabled { get; set; }
    public bool IsInstalled { get; set; }
    public List<string> SupportedMediaTypes { get; set; } = [];
    public List<string> SupportedLanguages { get; set; } = [];
    public JsonElement? ConfigSchema { get; set; }
    public JsonElement? RuntimeRequirements { get; set; }
    public DateTime CreateTime { get; set; }
}

public class PluginConfigDto
{
    public int Id { get; set; }
    public string PluginKey { get; set; } = string.Empty;
    public string? PluginVersion { get; set; }
    public string ConfigName { get; set; } = string.Empty;
    public JsonElement ConfigData { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreateTime { get; set; }
    public DateTime UpdateTime { get; set; }
}

public class PluginExecutionLogDto
{
    public int Id { get; set; }
    public string PluginKey { get; set; } = string.Empty;
    public string? PluginVersion { get; set; }
    public int? BusinessId { get; set; }
    public string ExecutionType { get; set; } = string.Empty;
    public string? SourceDir { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? ErrorMessage { get; set; }
    public int ProgressPercent { get; set; }
    public string? CurrentStep { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public int? DurationSeconds { get; set; }
    public JsonElement? MetadataOutput { get; set; }
    public JsonElement? CreatedFiles { get; set; }
    public JsonElement? Statistics { get; set; }
    public string? LogMessages { get; set; }

    // Retry and config fields
    public int? ConfigId { get; set; }
    public int RetryCount { get; set; }
    public int MaxRetries { get; set; }
    public DateTime? LastRetryTime { get; set; }
}

public class InstallPluginResponseDto
{
    public string PluginKey { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string PluginDir { get; set; } = string.Empty;
}

public class UpdatePluginRequestDto
{
    public bool? IsEnabled { get; set; }
}

public class CreatePluginConfigRequestDto
{
    public string? PluginVersion { get; set; }
    public string ConfigName { get; set; } = "default";
    public JsonElement ConfigData { get; set; }
    public bool IsActive { get; set; } = false;
}

public class UpdatePluginConfigRequestDto
{
    public string? ConfigName { get; set; }
    public JsonElement? ConfigData { get; set; }
    public bool? IsActive { get; set; }
}

public class ExecutePluginRequestDto
{
    public string? PluginVersion { get; set; }
    public string SourceDir { get; set; } = string.Empty;
    public string? OutputDir { get; set; } = null;
    public string? ConfigName { get; set; } = null;
    public PluginMediaInfoDto? MediaInfo { get; set; }
}

public class PluginMediaInfoDto
{
    public string? Title { get; set; }
    public string? Year { get; set; }
}

public class ExecutePluginBatchRequestDto
{
    public string? PluginVersion { get; set; }
    public int LibraryId { get; set; }
    public List<int> MediaIds { get; set; } = [];
    public string? ConfigName { get; set; } = null;
}

public class ExecutePluginResponseDto
{
    public int ExecutionId { get; set; }
    public string Status { get; set; } = string.Empty;
}

public class ExecutePluginBatchResponseDto
{
    public int Total { get; set; }
    public List<int> ExecutionIds { get; set; } = [];
}

public class PluginMetadataDto
{
    public string Title { get; set; } = string.Empty;
    public string? OriginalTitle { get; set; }
    public string? Year { get; set; }
    public string? ReleaseDate { get; set; }
    public string? Summary { get; set; }
    public int? Runtime { get; set; }
    public string? Studio { get; set; }
    public string? Maker { get; set; }
    public string? Num { get; set; }
    public List<string> Tags { get; set; } = [];
    public List<string> Actors { get; set; } = [];
    public PluginImagesDto? Images { get; set; }
}

public class PluginImagesDto
{
    public string? Poster { get; set; }
    public string? Thumb { get; set; }
    public string? Fanart { get; set; }
}

public class PluginProgressDto
{
    public PluginMessageType? Type { get; set; }
    public string Step { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int Percent { get; set; }
}

public class PluginVersionDto
{
    public int Id { get; set; }
    public string Version { get; set; } = string.Empty;
}

public class PluginWithVersionsDto
{
    public string PluginKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Author { get; set; }
    public string? Homepage { get; set; }
    public List<PluginVersionDto> Versions { get; set; } = [];
}
