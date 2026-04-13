using Quartz;
using MediaHouse.Interfaces;

namespace MediaHouse.BackgroundJobs;

public class ScanJob : IJob
{
    private readonly IScanService _scanService;
    private readonly ILogger<ScanJob> _logger;

    public ScanJob(IScanService scanService, ILogger<ScanJob> logger)
    {
        _scanService = scanService;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        _logger.LogInformation("Incremental scan job started at {Time}", DateTime.UtcNow);

        try
        {
            var libraryId = 1; // TODO: Pass libraryId as a parameter to the job
            await _scanService.StartIncrementalScanAsync(libraryId);

            _logger.LogInformation("Incremental scan job completed for library {LibraryId}", libraryId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Incremental scan job failed");
            throw;
        }
    }
}
