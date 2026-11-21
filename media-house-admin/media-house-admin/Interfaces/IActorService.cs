using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface IActorService
{
    Task<(List<Staff> Actors, int TotalCount)> GetActorsAsync(
        int page,
        int pageSize,
        string? sortBy = null,
        bool favoritedOnly = false,
        int? userId = null);

    Task<Dictionary<int, int>> GetActorMediaCountsAsync(IEnumerable<int> actorIds);

    /// <summary>切换演员收藏，返回 true=已收藏 / false=已取消 / null=演员不存在</summary>
    Task<bool?> ToggleFavoriteAsync(int staffId, int userId);

    /// <summary>在给定演员集合里筛出该用户已收藏的 id</summary>
    Task<HashSet<int>> GetFavoritedStaffIdsAsync(int userId, IEnumerable<int> staffIds);
}
