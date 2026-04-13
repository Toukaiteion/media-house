namespace MediaHouse.DTOs;

public class MovieQueryDto
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public int? LibraryId { get; set; }
    public string? Tags { get; set; }          // 逗号分隔的标签
    public int? ActorId { get; set; }         // 演员ID
    public int? UserId { get; set; }           // 用户ID（用于 recent 排序和 favor 查询）
    public bool? Favor { get; set; }           // 是否只查询收藏
    public string? SortBy { get; set; }        // 排序类型: default, recent, mostly_play, name, release_date, create_time
    public string? Search { get; set; }        // 搜索关键词，按name或title模糊查询
    public string? SortOrder { get; set; }     // 排序方向: asc（升序）或 desc（降序），默认降序
}
