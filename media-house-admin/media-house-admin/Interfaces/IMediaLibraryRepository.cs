using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IMediaLibraryRepository : IRepository<MediaLibrary>
{
    Task<MediaLibrary?> GetByNameAsync(string name);
    Task<List<MediaLibrary>> GetByTypeAsync(LibraryType type);
    Task<List<MediaLibrary>> GetEnabledAsync();
}
