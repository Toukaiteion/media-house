namespace MediaHouse.DTOs;

public class LogQueryDto
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
    public string? Level { get; set; }        // Trace,Debug,Info,Warning,Error,Fatal（可逗号分隔）
    public string? Category { get; set; }     // SourceContext 模糊匹配
    public string? Message { get; set; }     // 消息内容模糊匹配
    public string? MachineName { get; set; }  // 机器名
    public DateTime? StartTime { get; set; }  // 开始时间
    public DateTime? EndTime { get; set; }    // 结束时间
    public bool? HasException { get; set; }  // 是否只查询有异常的日志
    public string? SortBy { get; set; }      // 排序字段：id、timestamp（默认 timestamp）
    public string? SortOrder { get; set; }   // 排序方向：asc 或 desc（默认 desc）
    public int? FromId { get; set; }        // 从指定 ID 开始查询（大于此 ID）
    public int? ToId { get; set; }          // 查询到指定 ID 结束（小于此 ID）
    public int? Limit { get; set; }          // 查询条数限制（与 Page/PageSize 互斥）
}
