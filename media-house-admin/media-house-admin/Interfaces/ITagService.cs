using MediaHouse.Data.Entities;

namespace MediaHouse.Interfaces;

public interface ITagService
{
    Task<(List<Tag> Tags, int TotalCount)> GetTagsAsync(int page, int pageSize, string? sortBy = null);
    Task<Dictionary<int, int>> GetTagMediaCountsAsync(IEnumerable<int> tagIds);
}
