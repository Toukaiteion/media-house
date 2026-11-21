using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface ITagService
{
    Task<(List<Tag> Tags, int TotalCount)> GetTagsAsync(
        int page,
        int pageSize,
        string? sortBy = null,
        bool favoritedOnly = false,
        int? userId = null);

    Task<Dictionary<int, int>> GetTagMediaCountsAsync(IEnumerable<int> tagIds);

    /// <summary>切换标签收藏，返回 true=已收藏 / false=已取消 / null=标签不存在</summary>
    Task<bool?> ToggleFavoriteAsync(int tagId, int userId);

    /// <summary>在给定标签集合里筛出该用户已收藏的 id</summary>
    Task<HashSet<int>> GetFavoritedTagIdsAsync(int userId, IEnumerable<int> tagIds);
}
