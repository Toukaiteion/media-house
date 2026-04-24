using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data.Adapters;

/// <summary>
/// SystemLog 适配器工厂
/// 根据数据库提供程序类型返回相应的适配器
/// </summary>
public static class SystemLogAdapterFactory
{
    private static ISystemLogAdapter? _adapter;
    private static readonly object _lock = new();

    /// <summary>
    /// 获取当前数据库的适配器（单例模式）
    /// </summary>
    public static ISystemLogAdapter GetAdapter(DbContext context)
    {
        if (_adapter != null)
            return _adapter;

        lock (_lock)
        {
            if (_adapter != null)
                return _adapter;

            var providerType = context.Database.ProviderName;
            _adapter = CreateAdapter(providerType);
            return _adapter;
        }
    }

    /// <summary>
    /// 根据提供程序类型创建适配器
    /// </summary>
    private static ISystemLogAdapter CreateAdapter(string? providerType)
    {
        return providerType?.ToLowerInvariant() switch
        {
            var p when p.Contains("mysql") || p.Contains("mariadb") => new MySqlSystemLogAdapter(),
            var p when p.Contains("sqlite") => new SqliteSystemLogAdapter(),
            _ => throw new NotSupportedException($"Database provider '{providerType}' is not supported for SystemLog.")
        };
    }

    /// <summary>
    /// 重置适配器（主要用于测试）
    /// </summary>
    public static void Reset()
    {
        lock (_lock)
        {
            _adapter = null;
        }
    }
}
