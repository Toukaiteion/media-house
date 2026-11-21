using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Extensions;
using MediaHouse.Interfaces;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/actors")]
[Authorize]
public class ActorsController(IActorService actorService, ILogger<ActorsController> logger) : ControllerBase
{
    private readonly IActorService _actorService = actorService;
    private readonly ILogger<ActorsController> _logger = logger;

    [HttpGet]
    public async Task<ActionResult> GetActors(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? sortBy = null,
        [FromQuery] bool favorited = false)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            var (actors, totalCount) = await _actorService.GetActorsAsync(page, pageSize, sortBy, favorited, userId);

            var actorIds = actors.Select(a => a.Id).ToList();
            var mediaCounts = await _actorService.GetActorMediaCountsAsync(actorIds);

            HashSet<int> favoritedIds = userId.HasValue
                ? await _actorService.GetFavoritedStaffIdsAsync(userId.Value, actorIds)
                : [];

            return Ok(new
            {
                Actors = actors.Select(a => new StaffDto
                {
                    Id = a.Id.ToString(),
                    Name = a.Name,
                    AvatarPath = a.AvatarPath,
                    MediaCount = mediaCounts.GetValueOrDefault(a.Id, 0),
                    IsFavorited = favoritedIds.Contains(a.Id)
                }).ToList(),
                Page = page,
                PageSize = pageSize,
                TotalCount = totalCount
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching actors");
            return StatusCode(500, new { error = "Failed to fetch actors" });
        }
    }

    /// <summary>切换演员收藏</summary>
    [HttpPost("{id}/favor")]
    public async Task<ActionResult> ToggleFavorite(int id)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var isFavorited = await _actorService.ToggleFavoriteAsync(id, userId.Value);
            if (isFavorited == null)
            {
                return NotFound(new { error = "Actor not found" });
            }

            return Ok(new { is_favorited = isFavorited.Value });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling favorite for actor {ActorId}", id);
            return StatusCode(500, new { error = "Failed to toggle actor favorite" });
        }
    }
}
