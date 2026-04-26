namespace MediaHouse.Config;

public class DatabaseOptions
{
    /// <summary>
    /// 数据库提供程序: Sqlite, MySql, MariaDB
    /// MariaDB 使用与 MySQL 相同的驱动程序
    /// </summary>
    public string Provider { get; set; } = "Sqlite";

    /// <summary>
    /// Sqlite 配置选项
    /// </summary>
    public SqliteOptions? Sqlite { get; set; }

    /// <summary>
    /// MySQL/MariaDB 连接配置
    /// MariaDB 使用相同的连接字符串格式
    /// </summary>
    public MySqlOptions? MySql { get; set; }

    /// <summary>
    /// 获取主数据库连接字符串
    /// </summary>
    public string GetDefaultConnection()
    {
        return IsMySqlOrMariaDb()
            ? MySql?.DefaultConnection ?? string.Empty
            : Sqlite?.DefaultConnection ?? string.Empty;
    }

    /// <summary>
    /// 获取日志数据库连接字符串或路径
    /// </summary>
    public string GetLoggerConnection()
    {
        return IsMySqlOrMariaDb()
            ? MySql?.Logger ?? string.Empty
            : Sqlite?.Logger ?? string.Empty;
    }

    /// <summary>
    /// 判断是否使用 MySQL 或 MariaDB
    /// </summary>
    public bool IsMySqlOrMariaDb()
    {
        return Provider.Equals("MySql", StringComparison.OrdinalIgnoreCase) ||
               Provider.Equals("MariaDB", StringComparison.OrdinalIgnoreCase);
    }
}

/// <summary>
/// Sqlite 配置选项
/// </summary>
public class SqliteOptions
{
    public string DefaultConnection { get; set; } = string.Empty;
    public string Logger { get; set; } = string.Empty;

    public string LoggerPath { get; set; } = string.Empty;
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
