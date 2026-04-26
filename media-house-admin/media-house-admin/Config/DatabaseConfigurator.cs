using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using Serilog;
using System.Text.RegularExpressions;

namespace MediaHouse.Config;

/// <summary>
/// 数据库配置器 - 封装所有数据库相关的配置逻辑
/// 支持 SQLite 和 MySQL/MariaDB，优先从环境变量读取配置
/// </summary>
public class DatabaseConfigurator
{
    private readonly IConfiguration _configuration;
    private readonly WebApplicationBuilder _builder;

    public DatabaseConfigurator(WebApplicationBuilder builder)
    {
        _builder = builder;
        _configuration = builder.Configuration;
    }

    /// <summary>
    /// 配置数据库服务（主数据库和日志数据库的 DbContext）
    /// </summary>
    public DatabaseConfigurator ConfigureServices()
    {
        var databaseOptions = GetDatabaseOptions();

        if (IsMySqlOrMariaDb(databaseOptions))
        {
            ConfigureMySql(databaseOptions);
        }
        else
        {
            ConfigureSqlite(databaseOptions);
        }

        return this;
    }

    /// <summary>
    /// 配置 Serilog 的数据库日志输出
    /// </summary>
    public DatabaseConfigurator ConfigureSerilog(LoggerConfiguration loggerConfig)
    {
        var databaseOptions = GetDatabaseOptions();

        if (IsMySqlOrMariaDb(databaseOptions))
        {
            ConfigureMySqlSink(loggerConfig, databaseOptions);
        }
        else
        {
            ConfigureSqliteSink(loggerConfig, databaseOptions);
        }

        return this;
    }

    /// <summary>
    /// 获取数据库配置选项
    /// </summary>
    private DatabaseOptions GetDatabaseOptions()
    {
        return _configuration.GetSection("Database")
            .Get<DatabaseOptions>() ?? new DatabaseOptions();
    }

    /// <summary>
    /// 判断是否使用 MySQL 或 MariaDB
    /// </summary>
    private bool IsMySqlOrMariaDb(DatabaseOptions options) =>
        options.Provider.Equals("MySql", StringComparison.OrdinalIgnoreCase) ||
        options.Provider.Equals("MariaDB", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// 配置 SQLite 数据库
    /// </summary>
    private void ConfigureSqlite(DatabaseOptions databaseOptions)
    {
        var defaultConnection = databaseOptions.Sqlite?.DefaultConnection
            ?? throw new InvalidOperationException("SQLite default connection string not configured");
        var loggerConnection = databaseOptions.Sqlite?.Logger
            ?? throw new InvalidOperationException("SQLite logger connection string not configured");

        _builder.Services.AddDbContext<MediaHouseDbContext>(options =>
            options.UseSqlite(defaultConnection).UseSnakeCaseNamingConvention());

        _builder.Services.AddDbContext<MediaHouseLogDbContext>(options =>
        {
            options.UseSqlite(loggerConnection);
            options.ConfigureWarnings(warning => warning.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.CommandExecuted)
                    .Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.CommandError));
        });
    }

    /// <summary>
    /// 配置 MySQL/MariaDB 数据库
    /// </summary>
    private void ConfigureMySql(DatabaseOptions databaseOptions)
    {
        var defaultConnection = databaseOptions.MySql?.DefaultConnection
            ?? throw new InvalidOperationException("MySQL/MariaDB connection string not configured");
        var loggerConnection = databaseOptions.MySql?.Logger
            ?? throw new InvalidOperationException("MySQL/MariaDB logger connection string not configured");

        _builder.Services.AddDbContext<MediaHouseDbContext>(options =>
            options.UseMySql(defaultConnection, ServerVersion.AutoDetect(defaultConnection))
                   .UseSnakeCaseNamingConvention());

        _builder.Services.AddDbContext<MediaHouseLogDbContext>(options =>
        {
            options.UseMySql(loggerConnection, ServerVersion.AutoDetect(loggerConnection));
            options.ConfigureWarnings(warning => warning.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.CommandExecuted)
                    .Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.CommandError));
        });
    }

    /// <summary>
    /// 配置 SQLite Serilog 日志输出
    /// </summary>
    private void ConfigureSqliteSink(LoggerConfiguration loggerConfig, DatabaseOptions databaseOptions)
    {
        var loggerConnection = databaseOptions.Sqlite?.LoggerPath
            ?? throw new InvalidOperationException("SQLite logger path not configured");

        loggerConfig.WriteTo.SQLite(
            sqliteDbPath: loggerConnection,
            tableName: "system_logs",
            restrictedToMinimumLevel: Serilog.Events.LogEventLevel.Debug
        );
    }

    /// <summary>
    /// 配置 MySQL/MariaDB Serilog 日志输出
    /// </summary>
    private void ConfigureMySqlSink(LoggerConfiguration loggerConfig, DatabaseOptions databaseOptions)
    {
        var loggerConnection = databaseOptions.MySql?.Logger
            ?? throw new InvalidOperationException("MySQL/MariaDB logger connection string not configured");

        loggerConfig.WriteTo.MySQL(
            connectionString: loggerConnection,
            tableName: "system_logs",
            restrictedToMinimumLevel: Serilog.Events.LogEventLevel.Debug
        );
    }

          /// <summary>
      /// 打印数据库配置信息到控制台
      /// </summary>
      public void PrintDatabaseInfo()
      {
          var options = GetDatabaseOptions();
          var configSource = DetermineConfigSource();

          Console.ForegroundColor = ConsoleColor.Cyan;
          Console.WriteLine("========================================");
          Console.WriteLine("  Database Configuration");
          Console.WriteLine("========================================");
          Console.ForegroundColor = ConsoleColor.White;

          Console.WriteLine($"Provider: {options.Provider}");
          Console.WriteLine($"Config Source: {configSource}");

          if (IsMySqlOrMariaDb(options))
          {
              Console.WriteLine($"Main DB: {MaskConnectionString(options.MySql?.DefaultConnection)}");
              Console.WriteLine($"Logger DB: {MaskConnectionString(options.MySql?.Logger)}");
          }
          else
          {
              Console.WriteLine($"Main DB: {options.Sqlite?.DefaultConnection}");
              Console.WriteLine($"Logger DB: {options.Sqlite?.Logger}");
              Console.WriteLine($"Logger Path: {options.Sqlite?.LoggerPath}");
          }

          Console.WriteLine("========================================");
          Console.ResetColor();
      }

      /// <summary>
      /// 判断配置来源（环境变量或 appsettings.json）
      /// </summary>
      private string DetermineConfigSource()
      {
          var hasProvider = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DB_PROVIDER"));
          return hasProvider ? "Environment Variables" : "appsettings.json";
      }

      /// <summary>
      /// 掩码连接字符串中的密码
      /// </summary>
      private string MaskConnectionString(string? connectionString)
      {
          if (string.IsNullOrEmpty(connectionString))
              return "(empty)";

          // 掩码 Password= 后面的内容
          var passwordPattern = @"Password=([^;]+)";
          var masked = Regex.Replace(connectionString, passwordPattern, "Password=***");

          // 掩码 Pwd= 后面的内容（MySQL 连接字符串的另一种写法）
          var pwdPattern = @"Pwd=([^;]+)";
          masked = Regex.Replace(masked, pwdPattern, "Pwd=***");

          return masked;
      }
}
