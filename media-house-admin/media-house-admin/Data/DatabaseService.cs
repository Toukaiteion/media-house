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

            _logger.LogInformation("Database initialized successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize database");
            throw;
        }
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
