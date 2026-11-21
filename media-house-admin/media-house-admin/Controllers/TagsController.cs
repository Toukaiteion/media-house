using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Extensions;
using MediaHouse.Interfaces;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/tags")]
[Authorize]
public class TagsController(ITagService tagService, ILogger<TagsController> logger) : ControllerBase
{
    private readonly ITagService _tagService = tagService;
    private readonly ILogger<TagsController> _logger = logger;

    [HttpGet]
    public async Task<ActionResult> GetTags(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? sortBy = null,
        [FromQuery] bool favorited = false)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            var (tags, totalCount) = await _tagService.GetTagsAsync(page, pageSize, sortBy, favorited, userId);

            var tagIds = tags.Select(t => t.Id).ToList();
            var mediaCounts = await _tagService.GetTagMediaCountsAsync(tagIds);

            HashSet<int> favoritedIds = userId.HasValue
                ? await _tagService.GetFavoritedTagIdsAsync(userId.Value, tagIds)
                : [];

            return Ok(new
            {
                Tags = tags.Select(t => new TagDto
                {
                    Id = t.Id.ToString(),
                    TagName = t.TagName,
                    MediaCount = mediaCounts.GetValueOrDefault(t.Id, 0),
                    IsFavorited = favoritedIds.Contains(t.Id)
                }).ToList(),
                Page = page,
                PageSize = pageSize,
                TotalCount = totalCount
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching tags");
            return StatusCode(500, new { error = "Failed to fetch tags" });
        }
    }

    /// <summary>切换标签收藏</summary>
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

            var isFavorited = await _tagService.ToggleFavoriteAsync(id, userId.Value);
            if (isFavorited == null)
            {
                return NotFound(new { error = "Tag not found" });
            }

            return Ok(new { is_favorited = isFavorited.Value });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling favorite for tag {TagId}", id);
            return StatusCode(500, new { error = "Failed to toggle tag favorite" });
        }
    }
}
