using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface ILibraryService
{
    Task<List<MediaLibrary>> GetAllLibrariesAsync();
    Task<MediaLibrary?> GetLibraryByIdAsync(int id);
    Task<MediaLibrary> CreateLibraryAsync(string name, LibraryType type, string path);
    Task<MediaLibrary?> UpdateLibraryAsync(int id, string name, string path, bool isEnabled);
    Task<bool> DeleteLibraryAsync(int id);
    Task<bool> TriggerScanAsync(int id);
}
