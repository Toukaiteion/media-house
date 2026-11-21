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
    IScanService scanService,
    ILogger<MoviesController> logger) : ControllerBase
{
    private readonly IMovieService _movieService = movieService;
    private readonly IScanService _scanService = scanService;
    private readonly ILogger<MoviesController> _logger = logger;

    /// <summary>
    /// 重新解析这部影片所在目录的元数据（重新读 NFO、重建标签/演员/图片关系）。
    /// 和上传元数据后的重扫是同一套逻辑，走的是单部影片扫描，不影响整个媒体库。
    /// </summary>
    [HttpPost("{id}/rescan")]
    public async Task<ActionResult> RescanMovie(int id)
    {
        try
        {
            var movie = await _movieService.GetMovieAsync(id);
            if (movie == null)
            {
                return NotFound(new { error = "Movie not found" });
            }

            if (string.IsNullOrWhiteSpace(movie.FilePath))
            {
                return BadRequest(new { error = "这部影片没有关联的视频文件，无法解析目录" });
            }

            var movieDirPath = Path.GetDirectoryName(movie.FilePath);
            if (string.IsNullOrWhiteSpace(movieDirPath) || !Directory.Exists(movieDirPath))
            {
                return BadRequest(new { error = $"影片目录不存在: {movieDirPath}" });
            }

            if (!int.TryParse(movie.MediaLibraryId, out var libraryId))
            {
                return BadRequest(new { error = "无法确定影片所属媒体库" });
            }

            _logger.LogInformation("Rescanning movie {MovieId} from directory {Dir}", id, movieDirPath);

            var result = await _scanService.ScanSingleMovieAsync(
                libraryId,
                Path.GetFileName(movieDirPath),
                movieDirPath);

            return Ok(new
            {
                message = "重新解析完成",
                title = result.Media.Title,
                media_id = result.Media.Id
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rescanning movie {MovieId}", id);
            return StatusCode(500, new { error = $"重新解析失败: {ex.Message}" });
        }
    }

    [HttpGet]
    public async Task<ActionResult<PagedResponseDto<MovieDto>>> GetMovies([FromQuery] MovieQueryDto query)
    {
        try
        {
            // 「最近播放」「只看收藏」都依赖当前用户，一律以 token 为准，不接受客户端指定
            query.UserId = HttpContext.GetUserId();

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
