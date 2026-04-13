using Quartz;
using Quartz.Impl;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;

namespace MediaHouse.BackgroundJobs;

public class QuartzService : IHostedService
{
    private readonly IScheduler _scheduler;
    private readonly ILogger<QuartzService> _logger;
    private readonly ConcurrentDictionary<string, string> _scheduledJobs = new();

    public QuartzService(IScheduler scheduler, ILogger<QuartzService> logger)
    {
        _scheduler = scheduler;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Quartz scheduler starting");
        await _scheduler.Start(cancellationToken);
        _logger.LogInformation("Quartz scheduler started");
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Quartz scheduler shutting down");
        await _scheduler.Shutdown(cancellationToken);
        _logger.LogInformation("Quartz scheduler shutdown complete");
    }

    public async Task ScheduleIncrementalScan(string libraryId, int intervalMinutes)
    {
        var jobKey = new JobKey($"IncrementalScan_{libraryId}", "LibraryScans");

        var job = JobBuilder.Create<ScanJob>()
            .WithIdentity(jobKey)
            .UsingJobData("LibraryId", libraryId)
            .Build();

        var triggerKey = new TriggerKey($"IncrementalScan_{libraryId}_Trigger", "LibraryScans");

        var trigger = TriggerBuilder.Create()
            .WithIdentity(triggerKey)
            .StartNow()
            .WithSimpleSchedule(x => x
                .RepeatForever()
                .WithIntervalInMinutes(intervalMinutes))
            .Build();

        await _scheduler.ScheduleJob(job, trigger);
        _scheduledJobs[libraryId] = jobKey.Name;

        _logger.LogInformation("Scheduled incremental scan for library {LibraryId} every {Interval} minutes", libraryId, intervalMinutes);
    }

    public async Task UnscheduleIncrementalScan(string libraryId)
    {
        if (_scheduledJobs.TryGetValue(libraryId, out var jobName))
        {
            var jobKey = new JobKey(jobName, "LibraryScans");
            await _scheduler.DeleteJob(jobKey);
            _scheduledJobs.TryRemove(libraryId, out _);

            _logger.LogInformation("Unscheduled incremental scan for library {LibraryId}", libraryId);
        }
    }

    public async Task ScheduleConsistencyCheck(int intervalHours)
    {
        var jobKey = new JobKey("ConsistencyCheck", "System");

        var job = JobBuilder.Create<ConsistencyCheckJob>()
            .WithIdentity(jobKey)
            .Build();

        var triggerKey = new TriggerKey("ConsistencyCheck_Trigger", "System");

        var trigger = TriggerBuilder.Create()
            .WithIdentity(triggerKey)
            .StartNow()
            .WithSimpleSchedule(x => x
                .RepeatForever()
                .WithIntervalInHours(intervalHours))
            .Build();

        await _scheduler.ScheduleJob(job, trigger);

        _logger.LogInformation("Scheduled consistency check every {Interval} hours", intervalHours);
    }
}
