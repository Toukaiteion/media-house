using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IPluginExecutionService
{
    Task<PluginExecutionLog> ExecutePluginAsync(
        string pluginKey,
        string sourceDir,
        string? outputDir = null,
        string? pluginVersion = null,
        string? configName = null,
        int? businessId = null);

    Task<List<PluginExecutionLog>> ExecuteBatchPluginAsync(
        string pluginKey,
        int libraryId,
        List<int> mediaIds,
        string? configName = null,
        string? pluginVersion = null);

    Task<PluginExecutionLog?> GetExecutionLogAsync(int executionId);
    Task<List<PluginExecutionLog>> GetPluginLogsAsync(string pluginKey, int? mediaId = null, int limit = 10);
    Task<bool> CancelExecutionAsync(int executionId);
    Task<bool> UpdateExecutionProgressAsync(int executionId, int percent, string currentStep, string? message = null, DTOs.PluginMessageType? type = null);
    Task<bool> UpdateExecutionStatusAsync(int executionId, string status, string? errorMessage = null);
}
