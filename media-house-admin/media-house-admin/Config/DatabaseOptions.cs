namespace MediaHouse.Config;

public class DatabaseOptions
{
    /// <summary>
    /// 数据库提供程序: Sqlite, MySql, MariaDB
    /// MariaDB 使用与 MySQL 相同的驱动程序
    /// </summary>
    public string Provider { get; set; } = "Sqlite";
    public string DefaultConnection { get; set; } = string.Empty;
    public string Logger { get; set; } = string.Empty;

    /// <summary>
    /// MySQL/MariaDB 连接配置
    /// MariaDB 使用相同的连接字符串格式
    /// </summary>
    public MySqlOptions? MySql { get; set; }
}

/// <summary>
/// MySQL/MariaDB 连接选项
/// MariaDB 是 MySQL 的兼容分支，使用相同的驱动程序和连接字符串格式
/// </summary>
public class MySqlOptions
{
    public string DefaultConnection { get; set; } = string.Empty;
    public string Logger { get; set; } = string.Empty;
}
