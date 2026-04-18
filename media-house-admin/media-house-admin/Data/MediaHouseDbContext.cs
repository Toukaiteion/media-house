using MediaHouse.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Data;

public class MediaHouseDbContext(DbContextOptions<MediaHouseDbContext> options) : DbContext(options)
{
    public DbSet<MediaLibrary> MediaLibraries { get; set; }
    public DbSet<Movie> Movies { get; set; }
    public DbSet<MediaFile> MediaFiles { get; set; }
    public DbSet<MediaImgs> MediaImgs { get; set; }
    public DbSet<SystemSyncLog> SystemSyncLogs { get; set; }
    public DbSet<PlayRecord> PlayRecords { get; set; }
    public DbSet<AppUser> AppUsers { get; set; }
    public DbSet<Staff> Staffs { get; set; }
    public DbSet<MediaTag> MediaTags { get; set; }
    public DbSet<MyFavor> MyFavors { get; set; }
    public DbSet<MediaStaff> MediaStaffs { get; set; }
    public DbSet<Media> Medias { get; set; }
    public DbSet<Tag> Tags { get; set; }
    public DbSet<Plugin> Plugins { get; set; }
    public DbSet<PluginConfig> PluginConfigs { get; set; }
    public DbSet<PluginExecutionLog> PluginExecutionLogs { get; set; }
    public DbSet<UploadTask> UploadTasks { get; set; }
    public DbSet<StagingMedia> StagingMedias { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Media -> MediaLibrary (many-to-one via LibraryId)
        modelBuilder.Entity<Media>()
            .HasOne(m => m.Library)
            .WithMany(ml => ml.Medias)
            .HasForeignKey(m => m.LibraryId)
            .OnDelete(DeleteBehavior.Cascade);

        // MediaLibrary -> Medias
        modelBuilder.Entity<MediaLibrary>()
            .HasMany(m => m.Medias)
            .WithOne(m => m.Library)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<MediaLibrary>()
            .Property(m => m.Type)
            .HasConversion<string>();

        modelBuilder.Entity<MediaLibrary>()
            .Property(m => m.Status)
            .HasConversion<string>();

        // Media -> Movie (1:1)
        modelBuilder.Entity<Movie>()
            .HasOne(m => m.Media)
            .WithOne(m => m.Movie)
            .HasForeignKey<Movie>(m => m.MediaId)
            .OnDelete(DeleteBehavior.Cascade);

        // Movie -> MediaFile (one-to-one via MovieId - legacy)
        modelBuilder.Entity<MediaFile>()
            .HasOne(mf => mf.Media)
            .WithMany(m => m.MediaFiles)
            .HasForeignKey(mf => mf.MediaId)
            .OnDelete(DeleteBehavior.Cascade);

        // SystemSyncLog -> MediaLibrary
        modelBuilder.Entity<SystemSyncLog>()
            .HasOne(sl => sl.MediaLibrary)
            .WithMany()
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AppUser>()
            .HasMany(u => u.PlayRecords)
            .WithOne(p => p.User)
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // MediaTag -> Tag relationship
        modelBuilder.Entity<MediaTag>()
            .HasOne(mt => mt.Tag)
            .WithMany(t => t.MediaTags)
            .HasForeignKey(mt => mt.TagId)
            .OnDelete(DeleteBehavior.Cascade);

        // MediaStaff -> Staff
        modelBuilder.Entity<MediaStaff>()
            .HasOne(ms => ms.Staff)
            .WithMany(s => s.MediaStaffs)
            .HasForeignKey(ms => ms.StaffId)
            .OnDelete(DeleteBehavior.Cascade);

        // MediaImgs -> Media (many-to-one via MediaId)
        modelBuilder.Entity<MediaImgs>()
            .HasOne(mi => mi.Media)
            .WithMany(m => m.MediaImgs)
            .HasForeignKey(mi => mi.MediaId)
            .OnDelete(DeleteBehavior.Cascade);

        // Indexes for performance
        modelBuilder.Entity<MediaFile>()
            .HasIndex(mf => mf.Path)
            .IsUnique();

        modelBuilder.Entity<PlayRecord>()
            .HasIndex(p => new { p.UserId, p.MediaType, p.MediaId });

        modelBuilder.Entity<PlayRecord>()
            .HasIndex(p => p.LastPlayTime);

        modelBuilder.Entity<AppUser>()
            .HasIndex(u => u.Username)
            .IsUnique();

        // Composite key for MediaTag - matches SQL (lib_id, media_id, tag_id)
        modelBuilder.Entity<MediaTag>()
            .HasKey(t => new { t.MediaLibraryId, t.MediaId, t.TagId });

        // Enum conversions
        modelBuilder.Entity<MediaLibrary>()
            .Property(m => m.Type)
            .HasConversion<string>();

        modelBuilder.Entity<MediaLibrary>()
            .Property(m => m.Status)
            .HasConversion<string>();

        modelBuilder.Entity<PlayRecord>()
            .Property(p => p.MediaType)
            .HasConversion<string>();

        modelBuilder.Entity<MediaTag>()
            .Property(t => t.MediaType)
            .HasConversion<string>();

        modelBuilder.Entity<MediaStaff>()
            .Property(ms => ms.MediaType)
            .HasConversion<string>();

        modelBuilder.Entity<MediaStaff>()
            .Property(ms => ms.RoleType)
            .HasConversion<string>();

        modelBuilder.Entity<MediaImgs>()
            .Property(mi => mi.Type)
            .HasConversion<string>();

        // Media PlayCount default value
        modelBuilder.Entity<Media>()
            .Property(m => m.PlayCount)
            .HasDefaultValue(0);

        modelBuilder.Entity<Staff>()
            .Property(s => s.Country)
            .HasConversion<string>();

        // Plugin configurations
        modelBuilder.Entity<Plugin>()
            .HasIndex(p => p.PluginKey);

        modelBuilder.Entity<Plugin>()
            .HasAlternateKey(p => new { p.PluginKey, p.Version });

        modelBuilder.Entity<PluginConfig>()
            .HasIndex(pc => pc.PluginKey);

        modelBuilder.Entity<PluginConfig>()
            .HasIndex(pc => new { pc.PluginKey, pc.ConfigName })
            .IsUnique();

        modelBuilder.Entity<PluginExecutionLog>()
            .HasIndex(pel => pel.PluginKey);

        modelBuilder.Entity<PluginExecutionLog>()
            .HasIndex(pel => pel.BusinessId);

        modelBuilder.Entity<PluginExecutionLog>()
            .HasIndex(pel => pel.Status);

        modelBuilder.Entity<PluginExecutionLog>()
            .HasIndex(pel => pel.StartTime);

        // Upload configurations
        modelBuilder.Entity<UploadTask>()
            .HasIndex(ut => ut.Status);

        modelBuilder.Entity<UploadTask>()
            .HasIndex(ut => ut.CreatedAt);

        modelBuilder.Entity<StagingMedia>()
            .HasIndex(sm => sm.Status);

        modelBuilder.Entity<StagingMedia>()
            .HasIndex(sm => sm.UploadTaskId);

        // StagingMedia -> UploadTask relationship
        modelBuilder.Entity<StagingMedia>()
            .HasOne(sm => sm.UploadTask)
            .WithMany()
            .HasForeignKey(sm => sm.UploadTaskId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
