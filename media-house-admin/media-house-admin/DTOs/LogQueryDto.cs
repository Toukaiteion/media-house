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
    public string? SortOrder { get; set; }   // asc 或 desc，默认 desc
}
