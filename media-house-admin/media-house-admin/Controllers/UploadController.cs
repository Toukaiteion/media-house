using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/upload")]
[Authorize]
public class UploadController(
    IUploadService uploadService,
    IChunkService chunkService,
    ILogger<UploadController> logger) : ControllerBase
{
    private readonly IUploadService _uploadService = uploadService;
    private readonly IChunkService _chunkService = chunkService;
    private readonly ILogger<UploadController> _logger = logger;

    [HttpPost("create")]
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

    [HttpPost("chunk/{uploadId}/{chunkIndex}")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10MB limit per chunk
    public async Task<ActionResult> UploadChunk(string uploadId, int chunkIndex)
    {
        try
        {
            if (Request.Body == null)
            {
                return BadRequest(new { error = "No data provided" });
            }

            await _chunkService.UploadChunkAsync(uploadId, chunkIndex, Request.Body);
            var progress = await _uploadService.GetUploadProgressAsync(uploadId);

            return Ok(new
            {
                chunkIndex,
                uploadedChunks = progress.UploadedChunks,
                progress = progress.Progress
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading chunk {ChunkIndex} for task {UploadId}", chunkIndex, uploadId);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("progress/{uploadId}")]
    public async Task<ActionResult<UploadProgressDto>> GetUploadProgress(string uploadId)
    {
        try
        {
            var result = await _uploadService.GetUploadProgressAsync(uploadId);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting upload progress for task {UploadId}", uploadId);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("pause/{uploadId}")]
    public async Task<ActionResult> PauseUpload(string uploadId)
    {
        try
        {
            var success = await _uploadService.PauseUploadAsync(uploadId);
            if (!success)
            {
                return NotFound(new { error = "Upload task not found" });
            }

            return Ok(new { message = "Upload paused" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error pausing upload task {UploadId}", uploadId);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("resume/{uploadId}")]
    public async Task<ActionResult> ResumeUpload(string uploadId)
    {
        try
        {
            var success = await _uploadService.ResumeUploadAsync(uploadId);
            if (!success)
            {
                return NotFound(new { error = "Upload task not found" });
            }

            return Ok(new { message = "Upload resumed" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resuming upload task {UploadId}", uploadId);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{uploadId}")]
    public async Task<ActionResult> DeleteUploadTask(string uploadId)
    {
        try
        {
            var success = await _uploadService.DeleteUploadTaskAsync(uploadId);
            if (!success)
            {
                return NotFound(new { error = "Upload task not found" });
            }

            return Ok(new { message = "Upload task deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting upload task {UploadId}", uploadId);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("list")]
    public async Task<ActionResult<List<UploadProgressDto>>> GetAllUploadTasks()
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

    [HttpPost("complete/{uploadId}")]
    public async Task<ActionResult<StagingMediaDto>> CompleteUpload(string uploadId, [FromBody] CompleteUploadRequest request)
    {
        try
        {
            var stagingService = HttpContext.RequestServices.GetRequiredService<IStagingService>();

            // 合并分片
            await _chunkService.CompleteUploadAsync(uploadId);

            // 创建待发布媒体
            var result = await stagingService.CreateStagingMediaAsync(uploadId, request);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error completing upload task {UploadId}", uploadId);
            return BadRequest(new { error = ex.Message });
        }
    }
}
