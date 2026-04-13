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

    public async Task<bool> DatabaseExistsAsync()
    {
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
