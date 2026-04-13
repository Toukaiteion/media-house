using Quartz;
using Microsoft.Extensions.Logging;
using MediaHouse.Interfaces;

namespace MediaHouse.BackgroundJobs;

public class ConsistencyCheckJob : IJob
{
    private readonly IConsistencyService _consistencyService;
    private readonly ILogger<ConsistencyCheckJob> _logger;

    public ConsistencyCheckJob(IConsistencyService consistencyService, ILogger<ConsistencyCheckJob> logger)
    {
        _consistencyService = consistencyService;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        _logger.LogInformation("Consistency check job started at {Time}", DateTime.UtcNow);

        try
        {
            var inconsistencies = await _consistencyService.CheckConsistencyAsync();

            if (inconsistencies > 0)
            {
                _logger.LogWarning("Found {Count} inconsistencies", inconsistencies);
                var report = await _consistencyService.GetInconsistencyReportAsync();
                foreach (var issue in report)
                {
                    _logger.LogWarning("Inconsistency: {Issue}", issue);
                }

                // Optionally auto-fix
                await _consistencyService.FixInconsistenciesAsync();
            }
            else
            {
                _logger.LogInformation("No inconsistencies found");
            }

            _logger.LogInformation("Consistency check job completed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Consistency check job failed");
            throw;
        }
    }
}
