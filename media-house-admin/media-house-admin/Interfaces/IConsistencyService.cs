namespace MediaHouse.Interfaces;

public interface IConsistencyService
{
    Task<int> CheckConsistencyAsync();
    Task<int> FixInconsistenciesAsync();
    Task<List<string>> GetInconsistencyReportAsync();
}
