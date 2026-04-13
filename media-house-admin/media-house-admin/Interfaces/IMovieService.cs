using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IMovieService
{
    Task<PagedResponseDto<MovieDto>> GetMoviesAsync(MovieQueryDto query);
    Task<bool> DeleteMovieAsync(int mediaId);
    Task<MovieDetailDto?> GetMovieAsync(int id, int? userId = null);
    Task<List<TagWithMoviesDto>> GetMoviesByTagsAsync(int? userId, MediaRecommendationQueryDto query);
    Task<List<ActorWithMoviesDto>> GetMoviesByActorsAsync(int? userId, MediaRecommendationQueryDto query);
}
