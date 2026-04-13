using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
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
    public async Task<ActionResult> GetTags([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? sortBy = null)
    {
        try
        {
            var (tags, totalCount) = await _tagService.GetTagsAsync(page, pageSize, sortBy);
            var tagIds = tags.Select(t => t.Id).ToList();
            var mediaCounts = await _tagService.GetTagMediaCountsAsync(tagIds);

            return Ok(new
            {
                Tags = tags.Select(t => new TagDto
                {
                    Id = t.Id.ToString(),
                    TagName = t.TagName,
                    MediaCount = mediaCounts.GetValueOrDefault(t.Id, 0)
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
}
