using MediaHouse.Config;
using MediaHouse.Data;
using MediaHouse.Data.repository;
using MediaHouse.Interfaces;
using MediaHouse.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;
using Quartz;
using Serilog;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Register database options
builder.Services.Configure<DatabaseOptions>(
    builder.Configuration.GetSection("Database"));

var databaseOptions = builder.Configuration.GetSection("Database").Get<DatabaseOptions>()
    ?? throw new InvalidOperationException("Database options not configured");

// Add database based on configuration
if (databaseOptions.Provider.Equals("MySql", StringComparison.OrdinalIgnoreCase) ||
    databaseOptions.Provider.Equals("MariaDB", StringComparison.OrdinalIgnoreCase))
{
    // MySQL/MariaDB configuration
    var defaultConnection = databaseOptions.MySql?.DefaultConnection
        ?? throw new InvalidOperationException("MySQL/MariaDB connection string not configured");
    var loggerConnection = databaseOptions.MySql?.Logger
        ?? throw new InvalidOperationException("MySQL/MariaDB logger connection string not configured");

    builder.Services.AddDbContext<MediaHouseDbContext>(options =>
        options.UseMySql(defaultConnection, ServerVersion.AutoDetect(defaultConnection))
               .UseSnakeCaseNamingConvention());

    builder.Services.AddDbContext<MediaHouseLogDbContext>(options =>
    {
        options.UseMySql(loggerConnection, ServerVersion.AutoDetect(loggerConnection));
        options.ConfigureWarnings(warning => warning.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.CommandExecuted)
                .Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.CommandError));
    });
}
else
{
    // SQLite configuration (default)
    var defaultConnection = databaseOptions.Sqlite?.DefaultConnection
        ?? throw new InvalidOperationException("SQLite default connection string not configured");
    var loggerConnection = databaseOptions.Sqlite?.Logger
        ?? throw new InvalidOperationException("SQLite logger connection string not configured");

    builder.Services.AddDbContext<MediaHouseDbContext>(options =>
        options.UseSqlite(defaultConnection).UseSnakeCaseNamingConvention());

    builder.Services.AddDbContext<MediaHouseLogDbContext>(options =>
    {
        options.UseSqlite(loggerConnection);
        options.ConfigureWarnings(warning => warning.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.CommandExecuted)
                .Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.CommandError));
    });
}

// Register services
builder.Services.AddScoped<ILibraryService, LibraryService>();
builder.Services.AddScoped<IScanService, ScanService>();
builder.Services.AddScoped<IMetadataService, MetadataService>();
builder.Services.AddScoped<IConsistencyService, ConsistencyService>();
builder.Services.AddScoped<IPlayRecordService, PlayRecordService>();
builder.Services.AddScoped<IMediaFileService, MediaFileService>();
builder.Services.AddScoped<DatabaseService>();
builder.Services.AddScoped<ITagService, TagService>();
builder.Services.AddScoped<IActorService, ActorService>();
builder.Services.AddScoped<IFavorService, FavorService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IPluginService, PluginService>();
builder.Services.AddScoped<IPluginConfigService, PluginConfigService>();
builder.Services.AddScoped<IPluginExecutionService, PluginExecutionService>();
builder.Services.AddScoped<IUploadService, UploadService>();
builder.Services.AddScoped<IChunkService, ChunkService>();
builder.Services.AddScoped<IStagingService, StagingService>();
builder.Services.AddScoped<IPublishService, PublishService>();

// Register event bus (singleton for app-wide event handling)
builder.Services.AddSingleton<IEventBus, EventBus>();

// Register logging level switch for dynamic log level control
var levelSwitchConfig = new LoggingLevelSwitchConfig();
builder.Services.AddSingleton(levelSwitchConfig);
builder.Services.AddScoped<ILogService, LogService>();

// Configure Serilog
var loggerConfig = new LoggerConfiguration()
    .MinimumLevel.ControlledBy(levelSwitchConfig.LevelSwitch)
    .Enrich.FromLogContext()
    .Enrich.WithMachineName()
    .Enrich.WithThreadId()
    .Enrich.WithProperty("Application", "MediaHouse")
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}");

// Add database sink based on provider
if (databaseOptions.Provider.Equals("MySql", StringComparison.OrdinalIgnoreCase) ||
    databaseOptions.Provider.Equals("MariaDB", StringComparison.OrdinalIgnoreCase))
{
    // MySQL/MariaDB sink
    var loggerConnection = databaseOptions.MySql?.Logger
        ?? throw new InvalidOperationException("MySQL/MariaDB logger connection string not configured");
    loggerConfig.WriteTo.MySQL(
        connectionString: loggerConnection,
        tableName: "system_logs",
        restrictedToMinimumLevel: Serilog.Events.LogEventLevel.Debug
    );
}
else
{
    // SQLite sink (default)
    var loggerConnection = databaseOptions.Sqlite?.LoggerPath
        ?? throw new InvalidOperationException("SQLite logger path not configured");
    loggerConfig.WriteTo.SQLite(
        sqliteDbPath: loggerConnection,
        tableName: "system_logs",
        restrictedToMinimumLevel: Serilog.Events.LogEventLevel.Debug
    );
}

Log.Logger = loggerConfig.CreateLogger();

builder.Services.AddHostedService<StagingMetadataHandler>();

builder.Host.UseSerilog();

// Configure JWT Settings
builder.Services.Configure<JwtSettings>(
    builder.Configuration.GetSection(JwtSettings.SectionName));

// Configure Upload Settings
builder.Services.Configure<UploadSettings>(
    builder.Configuration.GetSection("UploadSettings"));

builder.Services.Configure<PluginSettings>(
    builder.Configuration.GetSection("PluginSettings"));

// Register repositories
builder.Services.AddScoped<IMediaLibraryRepository, MediaLibraryRepository>();
builder.Services.AddScoped<IMovieRepository, MovieRepository>();
builder.Services.AddScoped<IAppUserRepository, AppUserRepository>();
builder.Services.AddScoped<IPlayRecordRepository, PlayRecordRepository>();
builder.Services.AddScoped<IMediaService, MediaService>();
builder.Services.AddScoped<IMovieService, MovieService>();

// Add Quartz.NET
builder.Services.AddQuartz(q =>
{
    // Default job factory
    // Configure jobs if needed
});

builder.Services.AddQuartzHostedService(options =>
{
    options.WaitForJobsToComplete = true;
});

// Add controllers
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
        options.JsonSerializerOptions.WriteIndented = true;
    });

// Configure JWT Authentication
var jwtSettings = builder.Configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>()
    ?? throw new InvalidOperationException("JWT settings not configured");

var key = Encoding.ASCII.GetBytes(jwtSettings.Secret);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = builder.Environment.IsProduction();
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidateAudience = true,
        ValidAudience = jwtSettings.Audience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Configure logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

// Configure Kestrel server timeouts for large file uploads
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(10);
    options.Limits.RequestHeadersTimeout = TimeSpan.FromMinutes(5);
});

var app = builder.Build();

// Initialize database
using (var scope = app.Services.CreateScope())
{
    var dbService = scope.ServiceProvider.GetRequiredService<DatabaseService>();
    await dbService.InitializeDatabaseAsync();
}

// Configure HTTP request pipeline
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/error");
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseCors("AllowAll");

app.UseAuthentication();
app.UseAuthorization();

app.UseStaticFiles();



app.MapControllers();

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.Run();
