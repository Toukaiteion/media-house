using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IScanService
{
    Task<SystemSyncLog> StartFullScanAsync(int libraryId);
    Task<SystemSyncLog> StartIncrementalScanAsync(int libraryId);
    Task<SystemSyncLog?> GetLatestScanLogAsync(int libraryId);
    Task<List<SystemSyncLog>> GetScanLogsAsync(int libraryId, int limit = 10);
}
