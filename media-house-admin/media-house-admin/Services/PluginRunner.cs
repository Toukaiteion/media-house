using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace MediaHouse.Services;

public class PluginRunnerResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string? MetadataOutput { get; set; }
    public string? CreatedFiles { get; set; }
    public string? Statistics { get; set; }
}

public class PluginRunner(ILogger logger)
{
    private readonly ILogger _logger = logger;

    public async Task<PluginRunnerResult> ExecuteAsync(
        string pluginDir,
        string entryPoint,
        string inputJson,
        CancellationToken cancellationToken,
        Func<DTOs.PluginProgressDto, Task> onProgress,
        Func<string, Task>? onError = null)
    {
        var result = new PluginRunnerResult();

        try
        {
            // Get the executable file path
            var executablePath = GetExecutablePath(pluginDir, entryPoint);
            if (executablePath == null || !File.Exists(executablePath))
            {
                result.ErrorMessage = $"Plugin executable not found: {executablePath ?? entryPoint}";
                _logger.LogError(result.ErrorMessage);
                return result;
            }

            _logger.LogInformation("Executing plugin: {ExecutablePath}", executablePath);

            // Create process start info
            var processStartInfo = new ProcessStartInfo
            {
                FileName = executablePath,
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = pluginDir,

                StandardErrorEncoding = Encoding.UTF8,
                StandardOutputEncoding = Encoding.UTF8
            };
            processStartInfo.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8"; // Ensure Python outputs UTF-8
            processStartInfo.EnvironmentVariables["PYTHONUTF8"] = "1";    // 全局强制
            processStartInfo.EnvironmentVariables["LANG"] = "en_US.UTF-8";

            // Start the process
            using var process = Process.Start(processStartInfo);
            
            if (process == null)
            {
                result.ErrorMessage = "Failed to start plugin process";
                _logger.LogError(result.ErrorMessage);
                return result;
            }

            // Write input to stdin
            await process.StandardInput.WriteAsync(inputJson);
            await process.StandardInput.FlushAsync();
            process.StandardInput.Close();

            // Capture stdout
            var stdoutBuilder = new StringBuilder();
            var stdoutTask = ConsumeOutputAsync(process.StandardOutput, line =>
            {
                stdoutBuilder.AppendLine(line);
            });

            // Capture stderr (progress updates)
            var stderrTask = ConsumeOutputAsync(process.StandardError, line =>
            {
                try
                {
                    _logger.LogDebug("【Progress update】: {Line}", line);
                    var progressJson = JsonDocument.Parse(line);
                    var progress = new DTOs.PluginProgressDto
                    {
                        Message = line, // 默认 message 是整行文本
                        Step = "",
                        Percent = 0
                    };
                    // 如果存在 message 字段，则将其设置为 message
                    if (progressJson.RootElement.TryGetProperty("message", out var msgProp))
                    {
                        progress.Message = msgProp.GetString() ?? "";
                    }
                    
                    // 如果存在 type 字段，则设置消息类型，进度步骤和百分比
                    if (progressJson.RootElement.TryGetProperty("type", out var typeProp))
                    {
                        var typeStr = typeProp.GetString();
                        // 根据类型处理
                        if (typeStr == "progress")
                        {
                            progress.Type = DTOs.PluginMessageType.Progress;
                            progress.Step = progressJson.RootElement.TryGetProperty("step", out var stepProp) ? stepProp.GetString() ?? "" : "";
                            progress.Percent = progressJson.RootElement.TryGetProperty("percent", out var percentProp) ? percentProp.GetInt32() : 0;
                        }
                        else if (typeStr == "error")
                        {
                            progress.Type = DTOs.PluginMessageType.Error;
                        }
                        else
                        {
                            // 其他类型也记录 message
                            progress.Type = null;
                        }
                    }
                    _ = onProgress(progress);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to parse progress JSON: {Line}", line);
                    // 解析失败，记录整行 line
                    _ = onError?.Invoke($"Failed to parse progress JSON: {line} {ex}");
                }
            });

            // Wait for process to complete
            await Task.WhenAny(Task.Run(() => process.WaitForExit()), Task.Delay(Timeout.Infinite, cancellationToken));

            // Wait for output tasks to complete
            await Task.WhenAll(stdoutTask, stderrTask);
            // Check if the process completed successfully
            if (process.ExitCode == 0)
            {
                result.Success = true;
                var stdout = stdoutBuilder.ToString();

                // Parse output JSON
                try
                {
                    var outputDoc = JsonDocument.Parse(stdout);
                    var root = outputDoc.RootElement;

                    if (root.TryGetProperty("metadata", out var metadataProp))
                    {
                        result.MetadataOutput = metadataProp.GetRawText();
                    }

                    if (root.TryGetProperty("created_files", out var filesProp))
                    {
                        result.CreatedFiles = filesProp.GetRawText();
                    }

                    if (root.TryGetProperty("statistics", out var statsProp))
                    {
                        result.Statistics = statsProp.GetRawText();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to parse plugin output JSON");
                    result.MetadataOutput = stdout; // Store raw output if parsing fails
                }

                _logger.LogInformation("Plugin executed successfully. Exit code: {ExitCode}", process.ExitCode);
            }
            else
            {
                result.ErrorMessage = $"Plugin execution failed with exit code: {process.ExitCode}";
                _logger.LogError(result.ErrorMessage);
            }
        }
        catch (OperationCanceledException)
        {
            result.ErrorMessage = "Plugin execution was cancelled";
            _logger.LogWarning(result.ErrorMessage);
        }
        catch (Exception ex)
        {
            result.ErrorMessage = $"Error executing plugin: {ex.Message}";
            _logger.LogError(ex, result.ErrorMessage);
        }

        return result;
    }

    private static string? GetExecutablePath(string pluginDir, string entryPoint)
    {
        var fullPath = Path.Combine(pluginDir, entryPoint);

        if (OperatingSystem.IsWindows())
        {
            // Check for .exe extension
            var exePath = fullPath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? fullPath : fullPath + ".exe";
            if (File.Exists(exePath))
            {
                return exePath;
            }
        }
        else if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
        {
            // Check for executable without extension
            if (File.Exists(fullPath))
            {
                return fullPath;
            }
        }

        // Check common variations
        var possiblePaths = new[]
        {
            fullPath,
            fullPath + ".exe",
            Path.Combine(pluginDir, "bin", "scraper"),
            Path.Combine(pluginDir, "bin", "scraper.exe"),
            Path.Combine(pluginDir, "bin", "run.sh"),
            Path.Combine(pluginDir, "run.sh")
        };

        foreach (var path in possiblePaths)
        {
            if (File.Exists(path))
            {
                return path;
            }
        }

        return null;
    }

    private static async Task ConsumeOutputAsync(StreamReader reader, Action<string> onLine)
    {
        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            onLine(line);
        }
    }
}
