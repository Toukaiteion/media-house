
using MediaHouse.Data.Adapters;
using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data;

public class MediaHouseLogDbContext(DbContextOptions<MediaHouseLogDbContext> options) : DbContext(options)
{
    private ISystemLogAdapter? _adapter;

    public DbSet<SystemLog> SystemLogs { get; set; }

    public ISystemLogAdapter GetAdapter()
    {
        _adapter ??= SystemLogAdapterFactory.GetAdapter(this);
        return _adapter;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var adapter = GetAdapter();
        var mapping = adapter.GetColumnMapping();

        // SystemLogs configuration
        modelBuilder.Entity<SystemLog>()
            .ToTable(mapping.TableName)
            .HasKey(l => l.Id);

        modelBuilder.Entity<SystemLog>()
            .HasIndex(l => l.Timestamp);

        modelBuilder.Entity<SystemLog>()
            .HasIndex(l => l.Level);

        // 使用适配器配置属性映射（包括 Ignore 配置）
        adapter.ConfigurePropertyMapping(modelBuilder);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // 保存前使用适配器准备数据
        var adapter = GetAdapter();
        foreach (var entry in ChangeTracker.Entries<SystemLog>())
        {
            if (entry.State == EntityState.Added || entry.State == EntityState.Modified)
            {
                adapter.PrepareForSave(entry.Entity);
            }
        }

        return await base.SaveChangesAsync(cancellationToken);
    }
}