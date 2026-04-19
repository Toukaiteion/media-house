using MediaHouse.Data.Entities;
using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IScanService
{
    Task<SystemSyncLog> StartFullScanAsync(int libraryId);
    Task<SystemSyncLog> StartIncrementalScanAsync(int libraryId);
    Task<SystemSyncLog?> GetLatestScanLogAsync(int libraryId);
    Task<List<SystemSyncLog>> GetScanLogsAsync(int libraryId, int limit = 10);
    Task<MediaScanResult> ScanSingleMovieAsync(int libraryId, string movieDirName, string movieDirPath);
}
