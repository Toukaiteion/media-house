using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MediaHouseScraperHost;

/// <summary>
/// Chrome/Edge Native Messaging 主机。
/// 协议：stdin/stdout 上「4 字节小端长度 + UTF-8 JSON」，一条消息一个往返。
/// 职责：调用本机 Python 搜刮器 -> 打包元数据 zip -> 上传到 MediaHouse。
/// 注意：stdout 只能输出协议帧，日志一律走 stderr。
/// </summary>
internal static class Program
{
    private static readonly object WriteLock = new();
    private static readonly Stream Stdout = Console.OpenStandardOutput();
    private static readonly string[] AllowedExtensions = [".nfo", ".jpg", ".jpeg", ".png", ".webp"];
    private const long MaxSingleFileBytes = 12L * 1024 * 1024;
    private const long MaxTotalBytes = 40L * 1024 * 1024; // 服务端上限 50MB，留余量

    private static async Task<int> Main()
    {
        try
        {
            var message = ReadMessage();
            if (message is null) return 0;

            var action = message["action"]?.GetValue<string>();
            if (action != "scrapeAndUpload")
            {
                Send(new { type = "error", message = $"未知操作: {action}" });
                return 0;
            }

            await HandleAsync(message);
            return 0;
        }
        catch (OperationCanceledException)
        {
            TrySend(new { type = "error", message = "搜刮超时，请检查本机网络或代理" });
            return 1;
        }
        catch (Exception ex)
        {
            TrySend(new { type = "error", message = ex.Message });
            return 1;
        }
    }

    private static async Task HandleAsync(JsonNode message)
    {
        var mediaId = message["media_id"]?.GetValue<string>();
        var serverUrl = message["server_url"]?.GetValue<string>()?.TrimEnd('/');
        var token = message["token"]?.GetValue<string>();

        if (string.IsNullOrWhiteSpace(mediaId) ||
            string.IsNullOrWhiteSpace(serverUrl) ||
            string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("缺少 media_id / server_url / token，请检查扩展设置和登录状态");
        }

        if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out var serverUri) ||
            (serverUri.Scheme != Uri.UriSchemeHttp && serverUri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException($"服务器地址不合法: {serverUrl}");
        }

        var config = HostConfig.Load();
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // 1. 取影片信息，拿到视频文件路径（用来决定 nfo 叫什么名字）
        Progress("读取影片信息…", 5);
        var movie = await GetMovieAsync(http, serverUrl, mediaId);
        var title = movie["title"]?.GetValue<string>() ?? "";
        var num = movie["num"]?.GetValue<string>() ?? "";
        var videoPath = movie["file_path"]?.GetValue<string>();

        var nfoBaseName = string.IsNullOrWhiteSpace(videoPath)
            ? "movie"
            : SanitizeFileName(Path.GetFileNameWithoutExtension(videoPath));

        // 2. 准备输出目录
        var workDir = Path.Combine(Path.GetTempPath(), "mediahouse-scrape", mediaId);
        if (Directory.Exists(workDir)) Directory.Delete(workDir, true);
        Directory.CreateDirectory(workDir);

        // 3. 跑本机 Python 搜刮器
        Progress("启动本机搜刮器…", 10);
        var result = await RunScraperAsync(config, new
        {
            action = "scrape",
            media_id = mediaId,
            title,
            num,
            file_path = videoPath,
            output_dir = workDir,
        });

        var status = result["status"]?.GetValue<string>();
        if (!string.Equals(status, "success", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                result["message"]?.GetValue<string>() ?? "搜刮器返回失败，请查看本机日志");
        }

        // 4. 打包：只收元数据文件，nfo 统一重命名成「视频同名.nfo」，
        //    确保服务端重新扫描时能覆盖旧的 nfo 而不是留下两个。
        Progress("打包元数据…", 70);
        var zipBytes = BuildZip(workDir, nfoBaseName);
        if (zipBytes.Length == 0) throw new InvalidOperationException("搜刮器没有产出任何可上传的文件");

        // 5. 上传
        Progress($"上传到服务器（{zipBytes.Length / 1024.0:F0} KB）…", 85);
        var payload = await UploadAsync(http, serverUrl, mediaId, zipBytes);

        Progress("完成", 100);
        Send(new
        {
            type = "done",
            title = payload?["title"]?.GetValue<string>() ?? title,
            media_id = mediaId,
        });
    }

    private static async Task<JsonNode> GetMovieAsync(HttpClient http, string serverUrl, string mediaId)
    {
        using var response = await http.GetAsync($"{serverUrl}/api/movies/{mediaId}");
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"读取影片信息失败 ({(int)response.StatusCode})，可能是登录已过期: {Trim(body)}");
        }

        return JsonNode.Parse(body) ?? throw new InvalidOperationException("影片信息为空");
    }

    private static async Task<JsonNode?> UploadAsync(HttpClient http, string serverUrl, string mediaId, byte[] zipBytes)
    {
        using var form = new MultipartFormDataContent();
        var filePart = new ByteArrayContent(zipBytes);
        filePart.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        form.Add(filePart, "file", "metadata.zip");

        using var response = await http.PostAsync($"{serverUrl}/api/media/{mediaId}/update-metadata", form);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"上传失败 ({(int)response.StatusCode}): {Trim(body)}");
        }

        return string.IsNullOrWhiteSpace(body) ? null : JsonNode.Parse(body);
    }

    private static async Task<JsonNode> RunScraperAsync(HostConfig config, object input)
    {
        var scraperPath = config.ResolveScraperPath();
        if (!File.Exists(scraperPath))
        {
            throw new InvalidOperationException($"找不到搜刮脚本: {scraperPath}（检查 host.config.json）");
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = config.Python,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = Path.GetDirectoryName(scraperPath)!,
        };
        startInfo.ArgumentList.Add(scraperPath);
        startInfo.Environment["PYTHONIOENCODING"] = "utf-8";
        startInfo.Environment["PYTHONUTF8"] = "1";

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("无法启动 Python，请检查 host.config.json 里的 python 路径");

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = Task.Run(async () =>
        {
            var lines = new StringBuilder();
            string? line;
            while ((line = await process.StandardError.ReadLineAsync()) is not null)
            {
                lines.AppendLine(line);
                ForwardProgress(line);
            }
            return lines.ToString();
        });

        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(input));
        process.StandardInput.Close();

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(config.TimeoutSeconds));
        try
        {
            await process.WaitForExitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            throw new OperationCanceledException($"搜刮超时（{config.TimeoutSeconds}s）");
        }

        var stdout = await stdoutTask;
        var stderr = await stderrTask;

        if (string.IsNullOrWhiteSpace(stdout))
        {
            throw new InvalidOperationException($"搜刮器没有输出结果（exit={process.ExitCode}）{Environment.NewLine}{Trim(stderr, 800)}");
        }

        try
        {
            return JsonNode.Parse(stdout)
                ?? throw new InvalidOperationException("搜刮器输出为空");
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"搜刮器输出不是合法 JSON: {ex.Message}{Environment.NewLine}{Trim(stdout, 500)}");
        }
    }

    private static void ForwardProgress(string line)
    {
        if (string.IsNullOrWhiteSpace(line)) return;
        try
        {
            var node = JsonNode.Parse(line);
            if (node?["type"]?.GetValue<string>() == "progress")
            {
                // 把 Python 的 0-100 压到 10-65 这一段，避免出现「100% 之后又跳回 70%」
                var raw = node["percent"]?.GetValue<int>() ?? 40;
                var scaled = Math.Clamp(10 + (int)(Math.Clamp(raw, 0, 100) * 0.55), 10, 65);
                Send(new
                {
                    type = "progress",
                    message = node["message"]?.GetValue<string>() ?? node["step"]?.GetValue<string>() ?? "处理中…",
                    percent = scaled,
                });
            }
        }
        catch (JsonException)
        {
            // 普通日志行，忽略
        }
        catch (InvalidOperationException)
        {
            // 字段类型不对，忽略
        }
    }

    private static byte[] BuildZip(string workDir, string nfoBaseName)
    {
        using var stream = new MemoryStream();
        long total = 0;

        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var file in Directory.EnumerateFiles(workDir, "*", SearchOption.AllDirectories))
            {
                var extension = Path.GetExtension(file).ToLowerInvariant();
                if (!AllowedExtensions.Contains(extension)) continue; // 绝不打包视频，避免覆盖原片

                var info = new FileInfo(file);
                if (info.Length == 0) continue;
                if (info.Length > MaxSingleFileBytes) continue;

                total += info.Length;
                if (total > MaxTotalBytes)
                {
                    throw new InvalidOperationException("元数据总大小超过 40MB，已中止上传");
                }

                var entryName = extension == ".nfo"
                    ? nfoBaseName + ".nfo"
                    : Path.GetRelativePath(workDir, file).Replace('\\', '/');

                archive.CreateEntryFromFile(file, entryName, CompressionLevel.Optimal);
            }
        }

        return stream.ToArray();
    }

    private static string SanitizeFileName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "movie";
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
        return name.Trim().TrimEnd('.');
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
        catch
        {
            // 忽略
        }
    }

    private static string Trim(string value, int max = 300)
    {
        if (string.IsNullOrEmpty(value)) return "";
        value = value.Trim();
        return value.Length <= max ? value : value[..max] + "…";
    }

    // ---------- Native Messaging 协议 ----------

    private static JsonNode? ReadMessage()
    {
        try
        {
            using var stdin = Console.OpenStandardInput();
            var header = new byte[4];
            stdin.ReadExactly(header);
            var length = BinaryPrimitives.ReadInt32LittleEndian(header);
            if (length <= 0 || length > 64 * 1024 * 1024) return null;

            var buffer = new byte[length];
            stdin.ReadExactly(buffer);
            return JsonNode.Parse(Encoding.UTF8.GetString(buffer));
        }
        catch (EndOfStreamException)
        {
            return null;
        }
    }

    private static void Progress(string message, int percent) =>
        Send(new { type = "progress", message, percent });

    private static void Send(object payload)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(payload);
        var header = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(header, json.Length);

        lock (WriteLock)
        {
            Stdout.Write(header);
            Stdout.Write(json);
            Stdout.Flush();
        }
    }

    private static void TrySend(object payload)
    {
        try
        {
            Send(payload);
        }
        catch
        {
            // 浏览器已经断开，算了
        }
    }
}

internal sealed class HostConfig
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public string Python { get; set; } = "python";
    public string Scraper { get; set; } = "scraper\\scraper.py";
    public int TimeoutSeconds { get; set; } = 300;

    public static HostConfig Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "host.config.json");
        if (!File.Exists(path)) return new HostConfig();

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<HostConfig>(json, Options) ?? new HostConfig();
    }

    public string ResolveScraperPath()
    {
        var path = Path.IsPathRooted(Scraper)
            ? Scraper
            : Path.Combine(AppContext.BaseDirectory, Scraper);
        return Path.GetFullPath(path);
    }
}
