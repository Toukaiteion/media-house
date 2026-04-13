using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json;

namespace MediaHouse.Services;

public class PluginInstallerResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string? PluginKey { get; set; }
    public string? Version { get; set; }
    public string? PluginDir { get; set; }
}

public class PluginDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Author { get; set; }
    public string? Homepage { get; set; }
    public List<string> SupportedMediaTypes { get; set; } = [];
    public List<string> SupportedLanguages { get; set; } = [];
    public JsonElement? ConfigSchema { get; set; }
    public JsonElement? RuntimeRequirements { get; set; }
    public string EntryPoint { get; set; } = "bin/scraper";
    public List<string> SupportedIdentifiers { get; set; } = [];
}

public class PluginInstaller(ILogger logger)
{
    private readonly ILogger _logger = logger;

    public async Task<PluginInstallerResult> InstallAsync(Stream fileStream, string pluginsBaseDir)
    {
        var result = new PluginInstallerResult();

        try
        {
            // Determine the file type
            var tempPath = Path.Combine(Path.GetTempPath(), $"plugin_upload_{Guid.NewGuid()}");

            // Save the uploaded file to a temporary location
            using (var tempStream = File.Create(tempPath))
            {
                await fileStream.CopyToAsync(tempStream);
            }

            try
            {
                // Extract the plugin package
                var extractDir = Path.Combine(Path.GetTempPath(), $"plugin_extract_{Guid.NewGuid()}");
                Directory.CreateDirectory(extractDir);

                if (tempPath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                {
                    ZipFile.ExtractToDirectory(tempPath, extractDir);
                }
                else if (tempPath.EndsWith(".tar.gz", StringComparison.OrdinalIgnoreCase) ||
                         tempPath.EndsWith(".tgz", StringComparison.OrdinalIgnoreCase))
                {
                    ExtractTarGz(tempPath, extractDir);
                }
                else
                {
                    // Try to detect the file type
                    using var archive = ZipFile.OpenRead(tempPath);
                    archive.ExtractToDirectory(extractDir);
                }

                // Find and parse plugin.json
                var pluginJsonPath = FindPluginJson(extractDir);
                if (pluginJsonPath == null)
                {
                    result.ErrorMessage = "plugin.json not found in the plugin package";
                    _logger.LogError(result.ErrorMessage);
                    return result;
                }

                var pluginDef = ParsePluginJson(pluginJsonPath);

                // Validate plugin definition
                var validationError = ValidatePluginDefinition(pluginDef);
                if (validationError != null)
                {
                    result.ErrorMessage = validationError;
                    _logger.LogError(result.ErrorMessage);
                    return result;
                }

                // Create the plugin directory
                var pluginDir = Path.Combine(pluginsBaseDir, pluginDef.Id, pluginDef.Version);
                if (Directory.Exists(pluginDir))
                {
                    result.ErrorMessage = $"Plugin {pluginDef.Id} version {pluginDef.Version} is already installed";
                    _logger.LogError(result.ErrorMessage);
                    return result;
                }

                Directory.CreateDirectory(pluginDir);

                // Copy files to the plugin directory
                CopyDirectory(extractDir, pluginDir);

                // Set executable permissions on Unix-like systems
                if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
                {
                    MakeExecutable(pluginDir, pluginDef.EntryPoint);
                }

                result.Success = true;
                result.PluginKey = pluginDef.Id;
                result.Version = pluginDef.Version;
                result.PluginDir = pluginDir;

                _logger.LogInformation("Plugin installed successfully: {PluginId} version {Version}", pluginDef.Id, pluginDef.Version);
            }
            finally
            {
                // Clean up temporary files
                if (File.Exists(tempPath))
                {
                    File.Delete(tempPath);
                }

                var extractDir = Path.Combine(Path.GetTempPath(), $"plugin_extract_{Guid.NewGuid()}");
                if (Directory.Exists(extractDir))
                {
                    try
                    {
                        Directory.Delete(extractDir, true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to delete temporary directory: {ExtractDir}", extractDir);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            result.ErrorMessage = $"Error installing plugin: {ex.Message}";
            _logger.LogError(ex, result.ErrorMessage);
        }

        return result;
    }

    private static string? FindPluginJson(string directory)
    {
        // First, check for plugin.json in the root
        var rootJson = Path.Combine(directory, "plugin.json");
        if (File.Exists(rootJson))
        {
            return rootJson;
        }

        // Search subdirectories
        foreach (var subDir in Directory.GetDirectories(directory))
        {
            var jsonPath = Path.Combine(subDir, "plugin.json");
            if (File.Exists(jsonPath))
            {
                return jsonPath;
            }
        }

        return null;
    }

    private static PluginDefinition ParsePluginJson(string jsonPath)
    {
        var jsonContent = File.ReadAllText(jsonPath);
        var jsonDoc = JsonDocument.Parse(jsonContent);
        var root = jsonDoc.RootElement;

        return new PluginDefinition
        {
            Id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "",
            Name = root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "" : "",
            Version = root.TryGetProperty("version", out var verProp) ? verProp.GetString() ?? "" : "",
            Description = root.TryGetProperty("description", out var descProp) ? descProp.GetString() : null,
            Author = root.TryGetProperty("author", out var authorProp) ? authorProp.GetString() : null,
            Homepage = root.TryGetProperty("homepage", out var homeProp) ? homeProp.GetString() : null,
            EntryPoint = root.TryGetProperty("entry_point", out var entryProp) ? entryProp.GetString() ?? "bin/scraper" : "bin/scraper",
            SupportedMediaTypes = ParseStringArray(root, "supported_media_types"),
            SupportedLanguages = ParseStringArray(root, "supported_languages"),
            SupportedIdentifiers = ParseStringArray(root, "supported_identifiers"),
            ConfigSchema = root.TryGetProperty("config_schema", out var configProp) ? configProp : null,
            RuntimeRequirements = root.TryGetProperty("runtime_requirements", out var reqProp) ? reqProp : null
        };
    }

    private static List<string> ParseStringArray(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var prop) || prop.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var result = new List<string>();
        foreach (var item in prop.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                result.Add(item.GetString() ?? "");
            }
        }
        return result;
    }

    private static string? ValidatePluginDefinition(PluginDefinition pluginDef)
    {
        if (string.IsNullOrEmpty(pluginDef.Id))
        {
            return "Plugin ID is required";
        }

        if (string.IsNullOrEmpty(pluginDef.Version))
        {
            return "Plugin version is required";
        }

        if (string.IsNullOrEmpty(pluginDef.Name))
        {
            return "Plugin name is required";
        }

        // Validate plugin ID format (alphanumeric, hyphens, underscores)
        if (!System.Text.RegularExpressions.Regex.IsMatch(pluginDef.Id, @"^[a-zA-Z0-9_-]+$"))
        {
            return "Plugin ID must contain only alphanumeric characters, hyphens, and underscores";
        }

        // Validate version format (semver)
        if (!System.Text.RegularExpressions.Regex.IsMatch(pluginDef.Version, @"^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$"))
        {
            return "Plugin version must follow semantic versioning (e.g., 1.0.0)";
        }

        return null;
    }

    private static void ExtractTarGz(string tarGzPath, string extractDir)
    {
        // This is a simplified tar.gz extraction
        // In production, you might want to use a dedicated library like SharpCompress
        throw new NotSupportedException("tar.gz extraction not implemented. Please use .zip format.");
    }

    private static void CopyDirectory(string sourceDir, string targetDir)
    {
        Directory.CreateDirectory(targetDir);

        foreach (var file in Directory.GetFiles(sourceDir))
        {
            var destFile = Path.Combine(targetDir, Path.GetFileName(file));
            File.Copy(file, destFile, true);
        }

        foreach (var subDir in Directory.GetDirectories(sourceDir))
        {
            var destSubDir = Path.Combine(targetDir, Path.GetFileName(subDir));
            CopyDirectory(subDir, destSubDir);
        }
    }

    private static void MakeExecutable(string pluginDir, string entryPoint)
    {
        var fullPath = Path.Combine(pluginDir, entryPoint);
        if (File.Exists(fullPath))
        {
            // Set execute permission (chmod +x)
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "chmod",
                    Arguments = $"+x \"{fullPath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using var process = Process.Start(psi);
                process?.WaitForExit();
            }
            catch (Exception ex)
            {
                // Non-critical error, log and continue
                Console.WriteLine($"Failed to set execute permission: {ex.Message}");
            }
        }
    }
}
