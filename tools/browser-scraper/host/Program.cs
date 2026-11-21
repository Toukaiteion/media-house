using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace MediaHouseScraperHost;

/// <summary>
/// Chrome/Edge Native Messaging 主机，常驻进程。
/// 协议：stdin/stdout 上「4 字节小端长度 + UTF-8 JSON」，一条消息一个帧。
///
/// 职责：
///   - 按本机 commands.json 的白名单执行命令（进程模式下 argv 数组直接传，不过 shell）
///   - 把命令的 stdout/stderr 逐行推回扩展，实现终端日志
///   - 支持取消、超时、目录选择框
///   - 内置 scrape-upload：调用本机 Python 抓取元数据、打包并上传回服务器
///
/// 注意：stdout 只能输出协议帧，日志一律走协议消息。
/// </summary>
internal static partial class Program
{
    private static readonly object WriteLock = new();
    private static readonly Stream Stdout = Console.OpenStandardOutput();

    private static readonly JsonSerializerOptions ConfigOptions = new()
    {
        // 不要设命名策略：commands.json 里写的是 camelCase（promptDirectory），
        // 配上 SnakeCaseLower 会变成要求 prompt_directory，多词字段会全部绑不上。
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    private static CommandsFile _commands = new();
    private static Process? _currentProcess;
    private static CancellationTokenSource? _currentCts;
    private static volatile bool _busy;
    private static string? _writableRoot;
    private static DateTime _commandsStamp;
    private static string? _configError;

    [STAThread]
    private static int Main()
    {
        // 允许 GBK 等代码页（.NET Core 默认只带 UTF-8/ASCII）
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);

        // 命令跑着的时候定期发个心跳：MV3 的 Service Worker 空闲 30 秒会被回收，
        // 有消息往来能把它留住，避免长命令跑一半连接就断了
        using var heartbeat = new System.Threading.Timer(
            _ => { if (_busy) TrySend(new { type = "heartbeat" }); },
            null,
            TimeSpan.FromSeconds(20),
            TimeSpan.FromSeconds(20));

        try
        {
            _commands = LoadCommands();
            var stdin = Console.OpenStandardInput();

            while (true)
            {
                var message = ReadMessage(stdin);
                if (message is null) break; // 端口被关闭（浏览器关闭或扩展重载）

                try
                {
                    Handle(message);
                }
                catch (Exception ex)
                {
                    Send(new { type = "error", message = ex.Message });
                }
            }
        }
        catch (Exception ex)
        {
            TrySend(new { type = "error", message = $"主机启动失败: {ex.Message}" });
            return 1;
        }
        finally
        {
            // 浏览器断开时别把子进程留成孤儿
            try
            {
                if (_currentProcess is { HasExited: false }) _currentProcess.Kill(entireProcessTree: true);
            }
            catch
            {
                // 忽略
            }
        }

        return 0;
    }

    // ---------------- 消息分发 ----------------

    private static void Handle(JsonNode message)
    {
        var action = message["action"]?.GetValue<string>() ?? string.Empty;

        switch (action)
        {
            case "ping":
                Send(new { type = "pong", busy = _busy });
                break;

            case "list":
                RefreshCommandsIfChanged();

                // snippets 里的路径也用 host 自己的目录展开，用户复制走就能跑
                var snippetValues = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["hostDir"] = AppContext.BaseDirectory.TrimEnd(
                        Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
                };

                Send(new
                {
                    type = "commands",
                    configError = _configError,
                    commands = _commands.Commands.Where(c => !c.Hidden).Select(c => new
                    {
                        id = c.Id,
                        name = c.Name,
                        description = c.Description,
                        promptDirectory = c.PromptDirectory,
                        promptOutputDirectory = c.PromptOutputDirectory,
                        // 默认值里如果含占位符（比如 ${num}），就别发给界面——那是留给主机在运行时解析的
                        @params = (c.Params ?? []).Select(p => new
                        {
                            key = p.Key,
                            label = p.Label,
                            type = p.Type ?? "text",
                            // 默认值里如果含占位符（比如 ${num}），界面留空，由主机在运行时解析
                            @default = p.Default is not null && !p.Default.Contains("${") ? p.Default : null,
                            hasDefault = p.Default is not null,
                            placeholder = p.Placeholder,
                            required = p.Required,
                        }).ToList(),
                    }).ToList(),
                    snippets = (_commands.Snippets ?? []).Select(s => new
                    {
                        name = s.Name,
                        description = s.Description,
                        command = Expand(s.Command ?? string.Empty, snippetValues),
                    }).ToList(),
                });
                break;

            case "pickDirectory":
                Send(new { type = "directory", path = PickDirectory() });
                break;

            case "pickFile":
                Send(new { type = "file", path = PickFile() });
                break;

            case "run":
                StartRun(message);
                break;

            case "cancel":
                CancelRun(message["runId"]?.GetValue<string>());
                break;

            default:
                Send(new { type = "error", message = $"未知操作: {action}" });
                break;
        }
    }

    // ---------------- 执行 ----------------

    private static void StartRun(JsonNode message)
    {
        RefreshCommandsIfChanged();

        var commandId = message["commandId"]?.GetValue<string>();
        var command = _commands.Commands.FirstOrDefault(c => c.Id == commandId);

        if (command is null)
        {
            Send(new { type = "error", message = $"未知命令: {commandId}" });
            return;
        }

        if (_busy)
        {
            Send(new { type = "error", message = "已有命令在执行，请先停止或等它跑完" });
            return;
        }

        var parameters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (message["params"] is JsonObject p)
        {
            foreach (var pair in p) parameters[pair.Key] = pair.Value?.ToString() ?? string.Empty;
        }
        if (message["context"] is JsonObject c)
        {
            foreach (var pair in c) parameters["context_" + pair.Key] = pair.Value?.ToString() ?? string.Empty;
        }

        // 默认值可以引用页面上下文（如 ${num}），到这里才解析。
        // scrape-upload 的上下文要等取到影片信息才有，那边会再补一次。
        // ${hostDir} 让 commands.json 能引用 host 自身目录（内置脚本等）
        parameters["hostDir"] = AppContext.BaseDirectory
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        if (command.Type != "scrape-upload")
        {
            try
            {
                PrepareParameters(command, parameters);
            }
            catch (InvalidOperationException ex)
            {
                Send(new { type = "error", message = ex.Message });
                return;
            }
        }

        var runId = Guid.NewGuid().ToString("N")[..8];
        _busy = true;
        _currentCts = new CancellationTokenSource();

        Send(new { type = "started", runId, commandId = command.Id, name = command.Name });

        _ = Task.Run(async () =>
        {
            var stopwatch = Stopwatch.StartNew();
            var exitCode = -1;

            try
            {
                exitCode = command.Type == "scrape-upload"
                    ? await RunScrapeUploadAsync(command, parameters, runId, _currentCts.Token)
                    : await RunProcessAsync(command, parameters, runId, _currentCts.Token);
            }
            catch (OperationCanceledException)
            {
                EmitLine(runId, "stderr", "[已取消]");
                exitCode = -1;
            }
            catch (Exception ex)
            {
                EmitLine(runId, "stderr", $"[错误] {ex.Message}");
                exitCode = -1;
            }
            finally
            {
                _busy = false;
                _currentCts?.Dispose();
                _currentCts = null;
                _currentProcess = null;
            }

            Send(new { type = "exit", runId, code = exitCode, durationMs = stopwatch.ElapsedMilliseconds });
        });
    }

    /// <summary>补齐默认值并校验必填参数；缺参数时抛 InvalidOperationException。</summary>
    private static void PrepareParameters(CommandDefinition command, Dictionary<string, string> parameters)
    {
        foreach (var param in command.Params ?? [])
        {
            if (!string.IsNullOrWhiteSpace(parameters.GetValueOrDefault(param.Key, string.Empty))) continue;
            if (string.IsNullOrWhiteSpace(param.Default)) continue;

            parameters[param.Key] = Expand(param.Default, parameters);
        }

        var missing = (command.Params ?? [])
            .Where(param => param.Required
                && string.IsNullOrWhiteSpace(parameters.GetValueOrDefault(param.Key, string.Empty)))
            .Select(param => string.IsNullOrWhiteSpace(param.Label) ? param.Key : param.Label)
            .ToList();

        if (missing.Count > 0)
        {
            throw new InvalidOperationException($"缺少必填参数：{string.Join("、", missing)}");
        }
    }

    private static async Task<int> RunProcessAsync(
        CommandDefinition command,
        Dictionary<string, string> parameters,
        string runId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Executable))
        {
            throw new InvalidOperationException("命令没有配置 executable");
        }

        var executable = command.Executable;

        // 只有写绝对路径时才做存在性检查；像 cmd.exe / python 这种交给系统 PATH 解析
        if (Path.IsPathRooted(executable) && !File.Exists(executable))
        {
            throw new FileNotFoundException($"找不到可执行文件: {executable}");
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            UseShellExecute = false,
            CreateNoWindow = true,
            // 重定向 stdin 并在启动后立刻关闭：否则子进程会继承 Native Messaging 的管道，
            // 交互式程序可能把协议数据读走，导致后续消息错乱
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        var args = BuildArgv(command, parameters);
        foreach (var arg in args) startInfo.ArgumentList.Add(arg);

        var workingDirectory = !string.IsNullOrWhiteSpace(command.WorkingDirectory)
            ? command.WorkingDirectory
            : Path.GetDirectoryName(executable);
        if (!string.IsNullOrEmpty(workingDirectory) && Directory.Exists(workingDirectory))
        {
            startInfo.WorkingDirectory = workingDirectory;
        }

        startInfo.Environment["PYTHONIOENCODING"] = "utf-8";
        startInfo.Environment["PYTHONUTF8"] = "1";

        // PyInstaller 打包的程序（jcatch / jsearch）启动时要往 TMP 解包。
        // 系统 %TEMP% 可能不可写，指到我们探测出来的可写目录。
        try
        {
            var scratch = EnsureScratchDirectory();
            startInfo.Environment["TMP"] = scratch;
            startInfo.Environment["TEMP"] = scratch;
            startInfo.Environment["TMPDIR"] = scratch;
        }
        catch (Exception ex)
        {
            EmitLine(runId, "stderr", $"[警告] 无法准备临时目录：{ex.Message}");
        }

        EmitLine(runId, "stdout", $"> {Path.GetFileName(executable)} {string.Join(' ', args)}");

        using var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };

        try
        {
            if (!process.Start())
            {
                throw new InvalidOperationException("命令启动失败");
            }
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            throw new InvalidOperationException($"无法启动命令 {executable}: {ex.Message}");
        }

        _currentProcess = process;

        // 直接读字节流自己解码：中文 Windows 上的程序可能输出 GBK，
        // 也可能是 UTF-8，靠 StreamReader 的固定编码一定会有一边乱码。
        var stdoutTask = PumpAsync(process.StandardOutput.BaseStream, runId, "stdout");
        var stderrTask = PumpAsync(process.StandardError.BaseStream, runId, "stderr");

        // 关掉子进程的 stdin：需要输入的命令会读到 EOF 而不是卡住或吃掉协议数据
        try
        {
            process.StandardInput.Close();
        }
        catch
        {
            // 忽略
        }

        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(30, command.TimeoutSeconds)));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        try
        {
            await process.WaitForExitAsync(linked.Token);
        }
        catch (OperationCanceledException)
        {
            try
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
            }
            catch
            {
                // 进程可能刚好自己退出了
            }

            throw timeoutCts.IsCancellationRequested && !cancellationToken.IsCancellationRequested
                ? new TimeoutException($"命令超时（{command.TimeoutSeconds} 秒），已终止")
                : new OperationCanceledException();
        }

        // 等输出管道把剩余行冲出来
        process.WaitForExit(2000);
        try
        {
            await Task.WhenAll(stdoutTask, stderrTask);
        }
        catch
        {
            // 管道已断
        }

        return process.ExitCode;
    }

    /// <summary>逐行抽子进程输出，按 UTF-8 → GBK 的顺序试探解码（中文 Windows 常见 GBK）。</summary>
    private static async Task PumpAsync(Stream stream, string runId, string kind)
    {
        var buffer = new byte[8192];
        var pending = new List<byte>(8192);

        while (true)
        {
            int read;
            try
            {
                read = await stream.ReadAsync(buffer);
            }
            catch
            {
                break;
            }

            if (read <= 0) break;

            for (var i = 0; i < read; i++)
            {
                var value = buffer[i];
                if (value == (byte)'\n')
                {
                    EmitLine(runId, kind, Decode(pending));
                    pending.Clear();
                }
                else if (value != (byte)'\r')
                {
                    pending.Add(value);
                }
            }

            // 没有换行的超长输出，别把内存吃满
            if (pending.Count > 64 * 1024)
            {
                EmitLine(runId, kind, Decode(pending));
                pending.Clear();
            }
        }

        if (pending.Count > 0)
        {
            EmitLine(runId, kind, Decode(pending));
        }
    }

    private static string Decode(List<byte> bytes)
    {
        if (bytes.Count == 0) return string.Empty;

        var data = bytes.ToArray();

        try
        {
            // 严格模式：遇到非法 UTF-8 序列直接抛，交给 GBK 兜底
            return new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true).GetString(data);
        }
        catch (DecoderFallbackException)
        {
            try
            {
                return System.Text.Encoding.GetEncoding(936).GetString(data);
            }
            catch
            {
                return System.Text.Encoding.UTF8.GetString(data);
            }
        }
    }

    /// <summary>把 ${xxx} 换成对应值；优先取 context_xxx（页面上下文，如番号），其次取参数值。</summary>
    private static string Expand(string template, Dictionary<string, string> values)
    {
        return PlaceholderRegex().Replace(template, match =>
        {
            var key = match.Groups[1].Value;

            if (values.TryGetValue("context_" + key, out var context) && !string.IsNullOrEmpty(context))
            {
                return context;
            }

            return values.GetValueOrDefault(key, string.Empty);
        });
    }

    [GeneratedRegex(@"\$\{(\w+)\}")]
    private static partial Regex PlaceholderRegex();

    private static IEnumerable<string> ExpandArgs(List<string>? args, Dictionary<string, string> values)
    {
        if (args is null) yield break;

        foreach (var raw in args)
        {
            yield return Expand(raw, values);
        }
    }

    /// <summary>
    /// 组装命令行：先展开 args 里的固定部分，再按 params 定义追加可选参数。
    /// params 里 type=boolean 的用 FlagTrue / FlagFalse 决定加哪个开关。
    /// </summary>
    private static List<string> BuildArgv(CommandDefinition command, Dictionary<string, string> values)
    {
        var argv = ExpandArgs(command.Args, values).ToList();

        foreach (var param in command.Params ?? [])
        {
            if (param.NoArg) continue;

            var value = values.GetValueOrDefault(param.Key, string.Empty);

            if (string.Equals(param.Type, "boolean", StringComparison.OrdinalIgnoreCase))
            {
                var enabled = ParseBool(value, ParseBool(param.Default, false));
                var flag = enabled ? param.FlagTrue : param.FlagFalse;
                if (!string.IsNullOrWhiteSpace(flag)) argv.Add(Expand(flag, values));
                continue;
            }

            if (string.IsNullOrWhiteSpace(value)) continue;
            if (param.Arg is null || param.Arg.Count == 0) continue;

            var scoped = new Dictionary<string, string>(values, StringComparer.OrdinalIgnoreCase)
            {
                ["value"] = value,
            };

            foreach (var item in param.Arg)
            {
                argv.Add(Expand(item, scoped));
            }
        }

        return argv;
    }

    private static bool ParseBool(string? value, bool fallback)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallback;
        return value.Trim().ToLowerInvariant() is "true" or "1" or "yes" or "on";
    }

    private static void CancelRun(string? runId)
    {
        try
        {
            _currentCts?.Cancel();
        }
        catch
        {
            // 忽略
        }

        var process = _currentProcess;
        if (process is not null)
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

        Send(new { type = "cancelled", runId });
    }

    /// <summary>弹出系统目录选择框；用户取消返回 null。</summary>
    private static string? PickDirectory()
    {
        try
        {
            using var owner = new Form
            {
                TopMost = true,
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                Opacity = 0,
            };

            using var dialog = new FolderBrowserDialog
            {
                Description = "选择目录",
                UseDescriptionForTitle = true,
                ShowNewFolderButton = true,
            };

            return dialog.ShowDialog(owner) == DialogResult.OK ? dialog.SelectedPath : null;
        }
        catch (Exception ex)
        {
            Send(new { type = "error", message = $"无法打开目录选择框: {ex.Message}" });
            return null;
        }
    }

    /// <summary>弹出系统文件选择框；用户取消返回 null。</summary>
    private static string? PickFile()
    {
        try
        {
            using var owner = new Form
            {
                TopMost = true,
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                Opacity = 0,
            };

            using var dialog = new OpenFileDialog
            {
                Title = "选择文件",
                CheckFileExists = true,
                Filter = "所有文件|*.*",
            };

            return dialog.ShowDialog(owner) == DialogResult.OK ? dialog.FileName : null;
        }
        catch (Exception ex)
        {
            Send(new { type = "error", message = $"无法打开文件选择框: {ex.Message}" });
            return null;
        }
    }

    // ---------------- 内置动作：搜刮并上传 ----------------

    private static async Task<int> RunScrapeUploadAsync(
        CommandDefinition command,
        Dictionary<string, string> parameters,
        string runId,
        CancellationToken cancellationToken)
    {
        var mediaId = parameters.GetValueOrDefault("context_mediaId", string.Empty);
        var serverUrl = parameters.GetValueOrDefault("context_serverUrl", string.Empty).TrimEnd('/');
        var token = parameters.GetValueOrDefault("context_token", string.Empty);

        if (string.IsNullOrWhiteSpace(mediaId) || string.IsNullOrWhiteSpace(serverUrl) || string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("缺少 mediaId / serverUrl / token，请在详情页打开面板并确认已登录");
        }

        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        EmitLine(runId, "stdout", "[1/4] 读取影片信息…");
        var movie = await GetMovieAsync(http, serverUrl, mediaId);

        var title = movie["title"]?.GetValue<string>() ?? string.Empty;
        var num = movie["num"]?.GetValue<string>() ?? string.Empty;
        var videoPath = movie["file_path"]?.GetValue<string>();
        var nfoBaseName = string.IsNullOrWhiteSpace(videoPath)
            ? "movie"
            : SanitizeFileName(Path.GetFileNameWithoutExtension(videoPath));

        // 每次运行用独立目录：避免上一次残留把这一次卡住，也方便留几份结果对照
        // 上下文补齐后默认值（如 ${num}）才解析得出来
        parameters["context_num"] = num;
        parameters["context_title"] = title;
        parameters["context_mediaId"] = mediaId;
        parameters["mediaId"] = mediaId;
        PrepareParameters(command, parameters);

        var workDir = CreateWorkDirectory(runId, mediaId);
        EmitLine(runId, "stdout", $"临时目录: {workDir}");

        EmitLine(runId, "stdout", $"[2/4] 调用本地搜刮器（{(string.IsNullOrWhiteSpace(num) ? title : num)}）…");
        await RunLocalScraperAsync(command, parameters, workDir, mediaId, num, title, runId, cancellationToken);

        EmitLine(runId, "stdout", "[3/4] 打包元数据…");
        var package = BuildZip(workDir, nfoBaseName);
        if (package.Bytes.Length == 0) throw new InvalidOperationException("搜刮器没有产出可上传的文件");

        EmitLine(runId, "stdout",
            $"打包完成：元数据 {package.NfoFiles} 个、图片 {package.Images} 张、剧照 {package.Screenshots} 张" +
            $"（{package.Bytes.Length / 1024.0:F0} KB）");

        // 服务端只从 <影片目录>/extrafanart/ 里认剧照，一张都没有的话这里就提示，
        // 否则只会在页面上表现为「剧照不见了」，很难查
        if (package.Screenshots == 0)
        {
            EmitLine(runId, "stderr", "[提示] 这次没有打包到剧照（extrafanart），上传后影片详情页不会有剧照");
        }

        EmitLine(runId, "stdout", $"[4/4] 上传到服务器（{package.Bytes.Length / 1024.0:F0} KB）…");
        var payload = await UploadAsync(http, serverUrl, mediaId, package.Bytes);

        EmitLine(runId, "stdout", $"完成：{payload?["title"]?.GetValue<string>() ?? title}");
        return 0;
    }

    /// <summary>
    /// 调本地搜刮器把元数据写进 <paramref name="workDir"/>。
    /// 优先用 commands.json 里配置的 executable（例如 jcatch -k ${num} -o ${outputDir}），
    /// 没配 executable 时退回内置的 Python 脚本。
    /// </summary>
    private static async Task RunLocalScraperAsync(
        CommandDefinition command,
        Dictionary<string, string> parameters,
        string workDir,
        string mediaId,
        string num,
        string title,
        string runId,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(command.Executable))
        {
            var args = new Dictionary<string, string>(parameters, StringComparer.OrdinalIgnoreCase)
            {
                ["outputDir"] = workDir,
                ["mediaId"] = mediaId,
                ["num"] = num,
                ["title"] = title,
            };

            var exitCode = await RunProcessAsync(command, args, runId, cancellationToken);
            if (exitCode != 0)
            {
                throw new InvalidOperationException($"搜刮命令失败（退出码 {exitCode}）");
            }

            return;
        }

        var result = await RunScraperAsync(command, new
        {
            action = "scrape",
            media_id = mediaId,
            title,
            num,
            output_dir = workDir,
        }, runId, cancellationToken);

        if (!string.Equals(result["status"]?.GetValue<string>(), "success", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(result["message"]?.GetValue<string>() ?? "搜刮器返回失败");
        }
    }

    /// <summary>
    /// 找一个可写的临时根目录。有些环境不让往 %TEMP% 写（受控文件夹访问、受限账户、沙箱等），
    /// 所以按顺序探测几个候选位置，用第一个能写的，结果缓存起来。
    /// </summary>
    private static string ResolveWritableRoot()
    {
        if (_writableRoot is not null) return _writableRoot;

        var candidates = new List<string?>();

        var custom = Environment.GetEnvironmentVariable("MH_SCRAPE_TMP");
        if (!string.IsNullOrWhiteSpace(custom)) candidates.Add(custom);

        var temp = Path.GetTempPath();
        if (!string.IsNullOrWhiteSpace(temp)) candidates.Add(Path.Combine(temp, "mediahouse-scrape"));

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrWhiteSpace(localAppData)) candidates.Add(Path.Combine(localAppData, "MediaHouse", "scrape"));

        candidates.Add(Path.Combine(AppContext.BaseDirectory, "scrape-tmp"));

        var errors = new List<string>();

        foreach (var candidate in candidates)
        {
            if (string.IsNullOrWhiteSpace(candidate)) continue;

            try
            {
                Directory.CreateDirectory(candidate);
                _writableRoot = candidate;
                CleanupOldRuns(candidate);
                return candidate;
            }
            catch (Exception ex)
            {
                errors.Add($"  {candidate}: {ex.Message}");
            }
        }

        throw new InvalidOperationException(
            "没有可写的临时目录，请设置环境变量 MH_SCRAPE_TMP 指向一个可写目录。尝试过：\n" + string.Join("\n", errors));
    }

    /// <summary>清掉一天前的临时目录（正常退出时 PyInstaller 会自己清理 _MEI，异常退出就留下了）。</summary>
    private static void CleanupOldRuns(string root)
    {
        try
        {
            var cutoff = DateTime.UtcNow.AddDays(-1);

            foreach (var directory in Directory.GetDirectories(root))
            {
                try
                {
                    if (Directory.GetLastWriteTimeUtc(directory) < cutoff)
                    {
                        Directory.Delete(directory, recursive: true);
                    }
                }
                catch
                {
                    // 还在用或者没权限，跳过
                }
            }
        }
        catch
        {
            // 清理失败不影响主流程
        }
    }

    /// <summary>给子进程用的临时目录（PyInstaller 打包的程序要靠它解包）。</summary>
    private static string EnsureScratchDirectory()
    {
        var scratch = Path.Combine(ResolveWritableRoot(), "tmp");
        Directory.CreateDirectory(scratch);
        return scratch;
    }

    /// <summary>建好本次运行的独立子目录。</summary>
    private static string CreateWorkDirectory(string runId, string mediaId)
    {
        var root = ResolveWritableRoot();
        var workDir = Path.Combine(root, $"{mediaId}-{runId}");
        Directory.CreateDirectory(workDir);
        return workDir;
    }

    private static async Task<JsonNode> GetMovieAsync(HttpClient http, string serverUrl, string mediaId)
    {
        using var response = await http.GetAsync($"{serverUrl}/api/movies/{mediaId}");
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"读取影片信息失败 ({(int)response.StatusCode}): {Trim(body)}");
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

    private static async Task<JsonNode> RunScraperAsync(
        CommandDefinition command,
        object input,
        string runId,
        CancellationToken cancellationToken)
    {
        var scraperPath = ResolvePath(command.Scraper ?? "scraper\\scraper.py");
        if (!File.Exists(scraperPath))
        {
            throw new InvalidOperationException($"找不到搜刮脚本: {scraperPath}");
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = command.Python ?? "python",
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
            ?? throw new InvalidOperationException("无法启动 Python");

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = Task.Run(async () =>
        {
            string? line;
            while ((line = await process.StandardError.ReadLineAsync()) is not null)
            {
                EmitLine(runId, "stderr", line);
            }
        });

        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(input));
        process.StandardInput.Close();

        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(30, command.TimeoutSeconds)));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        try
        {
            await process.WaitForExitAsync(linked.Token);
        }
        catch (OperationCanceledException)
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch { }
            throw;
        }

        var stdout = await stdoutTask;
        await stderrTask;

        if (string.IsNullOrWhiteSpace(stdout))
        {
            throw new InvalidOperationException($"搜刮器没有输出结果（exit={process.ExitCode}）");
        }

        return JsonNode.Parse(stdout) ?? throw new InvalidOperationException("搜刮器输出为空");
    }

    private sealed record PackageResult(byte[] Bytes, int NfoFiles, int Images, int Screenshots);

    /// <summary>
    /// 打包成服务端能接受的结构：文件平铺到压缩包根，剧照放进 extrafanart/。
    ///
    /// 不能靠「输出目录下只有一个子目录」来定位内容根：jcatch 的产出是
    /// &lt;out&gt;/&lt;番号&gt;/，但只要 jcatch 或包装脚本在输出根多写一个文件/目录，
    /// 判定就会失败，剧照就会被摊平到根目录 —— 服务端只认 extrafanart/ 子目录，
    /// 表现出来就是「封面正常、剧照全丢了」。这里改成按文件所在目录和文件名判定。
    /// </summary>
    private static PackageResult BuildZip(string workDir, string nfoBaseName)
    {
        var allowed = new[] { ".nfo", ".jpg", ".jpeg", ".png", ".webp" };
        using var stream = new MemoryStream();

        long total = 0;
        var nfoFiles = 0;
        var images = 0;
        var screenshots = 0;

        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var file in Directory.EnumerateFiles(workDir, "*", SearchOption.AllDirectories))
            {
                var extension = Path.GetExtension(file).ToLowerInvariant();
                if (!allowed.Contains(extension)) continue;

                var info = new FileInfo(file);
                if (info.Length == 0 || info.Length > 12L * 1024 * 1024) continue;

                total += info.Length;
                if (total > 60L * 1024 * 1024) throw new InvalidOperationException("元数据总大小超过 60MB，已中止");

                string entryName;
                if (extension == ".nfo")
                {
                    // 统一改成「视频同名.nfo」，才能覆盖影片目录里原有的那份
                    entryName = nfoBaseName + ".nfo";
                    nfoFiles++;
                }
                else if (IsScreenshot(workDir, file))
                {
                    entryName = "extrafanart/" + info.Name;
                    screenshots++;
                }
                else
                {
                    entryName = info.Name;
                    images++;
                }

                archive.CreateEntryFromFile(file, entryName, CompressionLevel.Optimal);
            }
        }

        return new PackageResult(stream.ToArray(), nfoFiles, images, screenshots);
    }

    /// <summary>是否剧照：位于任意层级的 extrafanart 目录下，或文件名以 extrafanart/screenshot 开头。</summary>
    private static bool IsScreenshot(string root, string file)
    {
        var directory = Path.GetDirectoryName(file);
        while (!string.IsNullOrEmpty(directory) && directory.Length >= root.Length)
        {
            if (string.Equals(Path.GetFileName(directory), "extrafanart", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var parent = Path.GetDirectoryName(directory);
            if (string.Equals(parent, directory, StringComparison.OrdinalIgnoreCase)) break;
            directory = parent;
        }

        var name = Path.GetFileNameWithoutExtension(file);
        return name.StartsWith("extrafanart", StringComparison.OrdinalIgnoreCase)
            || name.StartsWith("screenshot", StringComparison.OrdinalIgnoreCase);
    }

    private static string SanitizeFileName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "movie";
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
        return name.Trim().TrimEnd('.');
    }

    private static string Trim(string value, int max = 300)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        value = value.Trim();
        return value.Length <= max ? value : value[..max] + "…";
    }

    private static string ResolvePath(string path) =>
        Path.IsPathRooted(path) ? path : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, path));

    // ---------------- 配置 ----------------

    private static CommandsFile LoadCommands()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "commands.json");
        if (!File.Exists(path))
        {
            _commandsStamp = default;
            _configError = $"找不到 {path}";
            return new CommandsFile();
        }

        try
        {
            var json = File.ReadAllText(path);
            var loaded = JsonSerializer.Deserialize<CommandsFile>(json, ConfigOptions) ?? new CommandsFile();
            _commandsStamp = File.GetLastWriteTimeUtc(path);
            _configError = null;
            return loaded;
        }
        catch (Exception ex)
        {
            // 配置写错时不要把 host 弄崩，留着错误信息回给面板
            _commandsStamp = File.GetLastWriteTimeUtc(path);
            _configError = $"commands.json 解析失败：{ex.Message}";
            return new CommandsFile();
        }
    }

    /// <summary>commands.json 改过就重新读一遍，这样加完命令只要重开面板，不用重启浏览器。</summary>
    private static CommandsFile RefreshCommandsIfChanged()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "commands.json");
            if (!File.Exists(path)) return _commands;

            if (File.GetLastWriteTimeUtc(path) != _commandsStamp)
            {
                _commands = LoadCommands();
            }
        }
        catch
        {
            // 读失败就继续用旧的
        }

        return _commands;
    }

    // ---------------- 协议读写 ----------------

    private static JsonNode? ReadMessage(Stream stdin)
    {
        try
        {
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

    private static void EmitLine(string runId, string stream, string line)
    {
        Send(new { type = "log", runId, stream, line });

        var match = ProgressRegex().Match(line);
        if (match.Success && int.TryParse(match.Groups[1].Value, out var percent) && percent is >= 0 and <= 100)
        {
            Send(new { type = "progress", runId, percent });
        }
    }

    [GeneratedRegex(@"(\d{1,3})\s*%")]
    private static partial Regex ProgressRegex();

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
            // 浏览器已经断开
        }
    }
}

internal sealed class CommandsFile
{
    public List<CommandDefinition> Commands { get; set; } = [];

    /// <summary>
    /// 只在面板上「显示 + 复制」的命令行片段，适合批量任务：
    /// 这类命令跑得久、参数多，放终端里跑更合适。
    /// </summary>
    public List<SnippetDefinition> Snippets { get; set; } = [];
}

/// <summary>面板「批量操作」里的一条可复制命令。</summary>
internal sealed class SnippetDefinition
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Command { get; set; } = string.Empty;
}

internal sealed class CommandDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>process（默认，执行外部程序）或 scrape-upload（内置动作）</summary>
    public string? Type { get; set; }

    public string? Executable { get; set; }
    public List<string>? Args { get; set; }
    public string? WorkingDirectory { get; set; }
    public int TimeoutSeconds { get; set; } = 600;

    public bool PromptDirectory { get; set; }
    public bool PromptOutputDirectory { get; set; }

    /// <summary>
    /// 不在面板命令下拉里显示（但用 run 仍可执行）。
    /// 批量任务用它：避免误点跑一整批，改由 snippets 提供可复制的命令行。
    /// </summary>
    public bool Hidden { get; set; }

    /// <summary>面板上要显示的参数表单，见 ParamDefinition</summary>
    public List<ParamDefinition>? Params { get; set; }

    // scrape-upload 内置动作使用
    public string? Python { get; set; }
    public string? Scraper { get; set; }
}

/// <summary>
/// 一个可以在面板上填的命令参数。
/// type: text / number / directory / file / boolean
/// - text/number/directory/file: 用 Arg 模板追加到命令行，模板里可用 ${value}
/// - boolean: 用 FlagTrue / FlagFalse 决定加哪个开关
/// - NoArg: 只作为占位符在 Args 里引用（如 jsearch 的位置参数 directory）
/// </summary>
internal sealed class ParamDefinition
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? Type { get; set; } = "text";
    public string? Default { get; set; }
    public string? Placeholder { get; set; }
    public bool Required { get; set; }
    public bool NoArg { get; set; }
    public List<string>? Arg { get; set; }
    public string? FlagTrue { get; set; }
    public string? FlagFalse { get; set; }
}
