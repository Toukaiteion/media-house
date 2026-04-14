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

    [HttpGet("find-by-md5/{file_md5}")]
    public async Task<ActionResult<UploadProgressDto>> FindByMd5(string file_md5)
    {
        try
        {
            var result = await _uploadService.FindByMd5Async(file_md5);
            if (result == null)
            {
                return NotFound(new { error = "upload_task_not_found", message = "未找到匹配的上传任务" });
            }
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error finding upload task by MD5 {FileMd5}", file_md5);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("chunk")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10.24MB limit per chunk
    public async Task<ActionResult> UploadChunk()
    {
        try
        {
            var form = await Request.ReadFormAsync();

            if (!form.ContainsKey("upload_id") || !form.ContainsKey("chunk_index"))
            {
                return BadRequest(new { error = "Missing required parameters" });
            }

            var uploadId = form["upload_id"].ToString();
            var chunkIndex = int.Parse(form["chunk_index"].ToString());

            if (!form.Files.Any())
            {
                return BadRequest(new { error = "No file data provided" });
            }

            var chunkFile = form.Files[0];
            if (chunkFile == null || chunkFile.Length == 0)
            {
                return BadRequest(new { error = "No file data provided" });
            }

            await _chunkService.UploadChunkAsync(uploadId, chunkIndex, chunkFile.OpenReadStream());
            var progress = await _uploadService.GetUploadProgressAsync(uploadId);

            return Ok(new
            {
                chunk_index = chunkIndex,
                uploaded_chunks = progress.uploaded_chunks,
                progress = progress.progress
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading chunk");
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("check-chunks/{upload_id}")]
    public async Task<ActionResult<CheckChunksResponse>> CheckChunks(string upload_id, [FromQuery] int index = 0)
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

    [HttpPost("merge")]
    public async Task<ActionResult<MergeResponse>> MergeUpload([FromBody] MergeRequest request)
    {
        try
        {
            var result = await _uploadService.MergeAsync(request.upload_id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error merging upload task {UploadId}", request.upload_id);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("progress/{upload_id}")]
    public async Task<ActionResult<UploadProgressDto>> GetUploadProgress(string upload_id)
    {
        try
        {
            var result = await _uploadService.GetUploadProgressAsync(upload_id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting upload progress for task {UploadId}", upload_id);
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
}
