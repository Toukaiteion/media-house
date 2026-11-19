namespace MediaHouse.Config;

/// <summary>
/// 媒体扫描配置。对应 appsettings.json 的 "Scan" 节点，
/// 也可以用环境变量覆盖，例如 MH_Scan__DeleteMissingMedia=false。
/// </summary>
public class ScanOptions
{
    /// <summary>
    /// 扫描时是否清理磁盘上已经不存在的媒体记录（默认开启）。
    /// </summary>
    public bool DeleteMissingMedia { get; set; } = true;

    /// <summary>
    /// 安全阈值：一次扫描要删除的记录占比超过该值时，跳过本次清理。
    /// 目的是防止存储挂载点掉线、媒体库路径配错时把整库记录清空。
    /// 设为 1 表示关闭保护（删多少都不拦）。
    /// </summary>
    public double PruneSafetyRatio { get; set; } = 0.9;
}
