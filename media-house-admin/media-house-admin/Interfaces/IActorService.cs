using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IActorService
{
    Task<(List<Staff> Actors, int TotalCount)> GetActorsAsync(int page, int pageSize, string? sortBy = null);
    Task<Dictionary<int, int>> GetActorMediaCountsAsync(IEnumerable<int> actorIds);
}
