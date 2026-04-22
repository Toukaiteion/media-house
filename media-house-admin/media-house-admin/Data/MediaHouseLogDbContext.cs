
using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data;

public class MediaHouseLogDbContext(DbContextOptions<MediaHouseLogDbContext> options) : DbContext(options)
{
    public DbSet<SystemLog> SystemLogs { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // SystemLogs configuration
        modelBuilder.Entity<SystemLog>()
            .ToTable("system_logs")
            .HasKey(l => l.Id);

        modelBuilder.Entity<SystemLog>()
            .HasIndex(l => l.Timestamp);

        modelBuilder.Entity<SystemLog>()
            .HasIndex(l => l.Level);

        modelBuilder.Entity<SystemLog>()
            .Property(l => l.Timestamp)
            .HasConversion(
                v => v.ToString("yyyy-MM-dd HH:mm:ss.ffffffzzz"), 
                
                // 2. 从数据库读取时：string -> DateTimeOffset
                v => DateTimeOffset.Parse(v)
            );
    }
}