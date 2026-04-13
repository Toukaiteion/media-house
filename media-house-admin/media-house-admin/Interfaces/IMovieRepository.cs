using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IMovieRepository : IRepository<Movie>
{
    Task<List<Movie>> GetByLibraryAsync(int libraryId);
    Task<Movie?> GetByTitleAsync(string title);
    Task<List<Movie>> SearchAsync(string query);
}
