using Microsoft.EntityFrameworkCore;
using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using Microsoft.Extensions.DependencyInjection;

namespace MediaHouse.Data;

public class DatabaseService(
    MediaHouseDbContext context,
    IServiceProvider serviceProvider,
    ILogger<DatabaseService> logger)
{
    private readonly MediaHouseDbContext _context = context;
    private readonly IServiceProvider _serviceProvider = serviceProvider;
    private readonly ILogger<DatabaseService> _logger = logger;

    public async Task InitializeDatabaseAsync()
    {
        try
        {
            // Ensure database is created and migrations applied
            await _context.Database.EnsureCreatedAsync();

            // Seed default admin user if no users exist
            await SeedDefaultAdminUserAsync();

            // 上次进程异常退出时可能残留「扫描中」状态，启动时复位
            await ResetStuckScanStatesAsync();

            // 补齐后加的表：EnsureCreated 对已存在的库什么都不做，老库升级上来会缺表
            await EnsureAddedTablesAsync();

            _logger.LogInformation("Database initialized successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize database");
            throw;
        }
    }

    /// <summary>
    /// 补齐后续版本新增的表（当前是 favorite_staffs / favorite_tags）。
    ///
    /// 项目用的是 EnsureCreated()，它只在数据库不存在时建表；已经部署的库不会自动补表，
    /// 于是新代码一查就报 "Table 'mediahouse.favorite_staffs' doesn't exist"。
    /// 这里用 IF NOT EXISTS 幂等地补一次，SQLite 和 MySQL 都覆盖。
    /// </summary>
    private async Task EnsureAddedTablesAsync()
    {
        var isMySql = _context.Database.ProviderName?.Contains("MySql", StringComparison.OrdinalIgnoreCase) == true;

        string[] statements = isMySql
            ?
            [
                """
                CREATE TABLE IF NOT EXISTS `favorite_staffs` (
                  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                  `user_id` bigint(20) unsigned NOT NULL,
                  `staff_id` bigint(20) unsigned NOT NULL,
                  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  UNIQUE KEY `uk_favorite_staffs_user_staff` (`user_id`,`staff_id`),
                  KEY `idx_favorite_staffs_user` (`user_id`),
                  KEY `idx_favorite_staffs_staff` (`staff_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """,
                """
                CREATE TABLE IF NOT EXISTS `favorite_tags` (
                  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                  `user_id` bigint(20) unsigned NOT NULL,
                  `tag_id` bigint(20) unsigned NOT NULL,
                  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  UNIQUE KEY `uk_favorite_tags_user_tag` (`user_id`,`tag_id`),
                  KEY `idx_favorite_tags_user` (`user_id`),
                  KEY `idx_favorite_tags_tag` (`tag_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """,
            ]
            :
            [
                "CREATE TABLE IF NOT EXISTS favorite_staffs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, staff_id INTEGER NOT NULL, create_time TEXT NOT NULL, UNIQUE (user_id, staff_id))",
                "CREATE INDEX IF NOT EXISTS idx_favorite_staffs_user ON favorite_staffs (user_id)",
                "CREATE INDEX IF NOT EXISTS idx_favorite_staffs_staff ON favorite_staffs (staff_id)",
                "CREATE TABLE IF NOT EXISTS favorite_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, create_time TEXT NOT NULL, UNIQUE (user_id, tag_id))",
                "CREATE INDEX IF NOT EXISTS idx_favorite_tags_user ON favorite_tags (user_id)",
                "CREATE INDEX IF NOT EXISTS idx_favorite_tags_tag ON favorite_tags (tag_id)",
            ];

        foreach (var sql in statements)
        {
            await _context.Database.ExecuteSqlRawAsync(sql);
        }

        _logger.LogDebug("已确认收藏相关表存在（{Provider}）", isMySql ? "MySQL" : "SQLite");
    }

    private async Task SeedDefaultAdminUserAsync()
    {
        try
        {
            // Check if any users exist
            var userCount = await _context.AppUsers.CountAsync();
            if (userCount > 0)
            {
                _logger.LogInformation("Users already exist, skipping default admin creation");
                return;
            }

            // Create default admin user
            var authService = _serviceProvider.GetRequiredService<IAuthService>();
            var passwordHash = authService.HashPassword("admin123");

            var adminUser = new AppUser
            {
                Username = "admin",
                PasswordHash = passwordHash,
                Email = "admin@mediahouse.local",
                IsActive = true,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };

            _context.AppUsers.Add(adminUser);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Default admin user created: username=admin, password=admin123");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to seed default admin user");
        }
    }

    /// <summary>
    /// 上次进程异常退出（容器重启、进程被杀）时，媒体库状态可能停在 Scanning、扫描日志停在
    /// Started / InProgress，前端会永远显示「扫描中」，也没有任何任务能再触发。启动时统一复位。
    /// </summary>
    private async Task ResetStuckScanStatesAsync()
    {
        var stuckLibraries = await _context.MediaLibraries
            .Where(l => l.Status == ScanStatus.Scanning)
            .ToListAsync();

        var stuckLogs = await _context.SystemSyncLogs
            .Where(l => l.Status == SyncStatus.Started || l.Status == SyncStatus.InProgress)
            .ToListAsync();

        if (stuckLibraries.Count == 0 && stuckLogs.Count == 0) return;

        foreach (var library in stuckLibraries)
        {
            library.Status = ScanStatus.Idle;
            library.UpdateTime = DateTime.UtcNow;
        }

        foreach (var log in stuckLogs)
        {
            log.Status = SyncStatus.Failed;
            log.ErrorMessage = "服务重启，扫描被中断";
            log.EndTime = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        _logger.LogWarning(
            "已复位 {LibraryCount} 个卡住的媒体库状态、{LogCount} 条未完成的扫描日志",
            stuckLibraries.Count, stuckLogs.Count);
    }

    public async Task<bool> DatabaseExistsAsync()    {
        return await _context.Database.CanConnectAsync();
    }

    public async Task MigrateDatabaseAsync()
    {
        try
        {
            var pendingMigrations = await _context.Database.GetPendingMigrationsAsync();
            if (pendingMigrations.Any())
            {
                await _context.Database.MigrateAsync();
                _logger.LogInformation("Database migration completed");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to migrate database");
            throw;
        }
    }
}
