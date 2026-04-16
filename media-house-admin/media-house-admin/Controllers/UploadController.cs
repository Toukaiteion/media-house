using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/media/upload-tasks")]
[Authorize]
public class UploadController(
    IUploadService uploadService,
    IChunkService chunkService,
    ILogger<UploadController> logger) : ControllerBase
{
    private readonly IUploadService _uploadService = uploadService;
    private readonly IChunkService _chunkService = chunkService;
    private readonly ILogger<UploadController> _logger = logger;

    [HttpGet]
    public async Task<ActionResult<List<UploadTaskDto>>> GetUploadTasks()
    {
        try
        {
            var result = await _uploadService.GetAllUploadTasksAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all upload tasks");
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<UploadTaskDto>> CreateUploadTask([FromBody] CreateUploadRequest request)
    {
        try
        {
            var result = await _uploadService.CreateUploadTaskAsync(request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating upload task");
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{upload_id}")]
    public async Task<ActionResult<UploadTaskDto>> GetUploadTask(string upload_id)
    {
        try
        {
            var result = await _uploadService.GetUploadProgressAsync(upload_id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting upload task {UploadId}", upload_id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{upload_id}/chunk")]
    [RequestSizeLimit(50 * 1024 * 1024)] // 50MB limit per chunk
    public async Task<ActionResult> UploadChunk(string upload_id, [FromQuery] int chunk_index)
    {
        try
        {
            await _chunkService.UploadChunkAsync(upload_id, chunk_index, Request.ContentLength ?? 0, Request.Body);
            var progress = await _uploadService.GetUploadProgressAsync(upload_id);

            return Ok(new
            {
                chunk_index,
                progress.UploadedChunks,
                progress.Progress
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading chunk {ChunkIndex} for task {UploadId}", chunk_index, upload_id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{upload_id}/merge")]
    public async Task<ActionResult<MergeResponse>> MergeUpload(string upload_id)
    {
        try
        {
            var result = await _uploadService.MergeAsync(upload_id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error merging upload task {UploadId}", upload_id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{upload_id}/check-chunk")]
    public async Task<ActionResult<CheckChunksResponse>> CheckChunks(string upload_id, [FromQuery] int? index = null)
    {
        try
        {
            var result = await _chunkService.CheckChunksAsync(upload_id, index);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking chunks for task {UploadId}", upload_id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{upload_id}")]
    public async Task<ActionResult> DeleteUploadTask(string upload_id)
    {
        try
        {
            var success = await _uploadService.DeleteUploadTaskAsync(upload_id);
            if (!success)
            {
                return NotFound(new { error = "Upload task not found" });
            }

            return Ok(new { message = "Upload task deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting upload task {UploadId}", upload_id);
            return BadRequest(new { error = ex.Message });
        }
    }
}
