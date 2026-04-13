using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Extensions;
using MediaHouse.Interfaces;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MoviesController(
    IMovieService movieService,
    ILogger<MoviesController> logger) : ControllerBase
{
    private readonly IMovieService _movieService = movieService;
    private readonly ILogger<MoviesController> _logger = logger;

    [HttpGet]
    public async Task<ActionResult<PagedResponseDto<MovieDto>>> GetMovies([FromQuery] MovieQueryDto query)
    {
        try
        {
            var result = await _movieService.GetMoviesAsync(query);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching movies");
            return StatusCode(500, new { error = "Failed to fetch movies" });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MovieDetailDto>> GetMovie(int id)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            var result = await _movieService.GetMovieAsync(id, userId);

            if (result == null)
            {
                return NotFound(new { error = "Movie not found" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching movie {MovieId}", id);
            return StatusCode(500, new { error = "Failed to fetch movie" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteMovie(int id)
    {
        try
        {
            var success = await _movieService.DeleteMovieAsync(id);

            if (!success)
            {
                return NotFound(new { error = "Movie not found" });
            }

            return Ok(new { message = "Movie deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting movie {MovieId}", id);
            return StatusCode(500, new { error = "Failed to delete movie" });
        }
    }

    [HttpGet("recommend/by-tags")]
    public async Task<ActionResult<List<TagWithMoviesDto>>> GetRecommendationsByTags([FromQuery] MediaRecommendationQueryDto query)
    {
        var userId = HttpContext.GetUserId();
        try
        {
            var result = await _movieService.GetMoviesByTagsAsync(userId, query);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching tag-based recommendations for user {UserId}", userId);
            return StatusCode(500, new { error = "Failed to fetch recommendations" });
        }
    }

    [HttpGet("recommend/by-actors")]
    public async Task<ActionResult<List<ActorWithMoviesDto>>> GetRecommendationsByActors([FromQuery] MediaRecommendationQueryDto query)
    {
        var userId = HttpContext.GetUserId();
        try
        {
            var result = await _movieService.GetMoviesByActorsAsync(userId, query);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching actor-based recommendations for user {UserId}", userId);
            return StatusCode(500, new { error = "Failed to fetch recommendations" });
        }
    }
}
