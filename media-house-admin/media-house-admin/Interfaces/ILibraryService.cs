using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface ILibraryService
{
    Task<List<MediaLibrary>> GetAllLibrariesAsync();
    Task<MediaLibrary?> GetLibraryByIdAsync(int id);
    Task<MediaLibrary> CreateLibraryAsync(string name, LibraryType type, string path, int? pluginId = null, int? pluginConfigId = null);
    Task<MediaLibrary?> UpdateLibraryAsync(int id, string name, string path, bool isEnabled, int? pluginId = null, int? pluginConfigId = null);
    Task<bool> DeleteLibraryAsync(int id);
    Task<bool> TriggerScanAsync(int id);
}
