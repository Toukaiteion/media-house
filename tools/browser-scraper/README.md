# MediaHouse 本地工具（浏览器扩展 + Native Messaging）

在 MediaHouse 页面上点一个悬浮按钮，**执行本机配置好的命令行工具**，实时查看终端日志。

- 命令由本机 `commands.json` 白名单定义，网页不能传任意命令进来
- 支持配置**多个站点**（本地 + 线上），各用各的服务器
- 每条命令可以声明参数，面板自动生成表单（文本 / 数字 / 目录选择 / 文件选择 / 开关）
- 支持取消、超时、实时日志、进度识别

---

## 目录

- [架构](#架构)
- [安装（一次性）](#安装一次性)
- [**新增一条命令**](#新增一条命令)
- [使用](#使用)
- [内置动作：跑完打包上传](#内置动作跑完打包上传)
- [实现细节](#实现细节)
- [排错](#排错)
- [自检脚本](#自检脚本)
- [安全边界](#安全边界)
- [文件结构](#文件结构)

---

## 架构

```
MediaHouse 页面（本地或线上任意一个已配置站点）
   └─ 悬浮按钮「本地工具」
        └─ 面板：命令下拉 / 参数表单 / 终端日志
             │ chrome.runtime.connect({name:'mh-runner'})
             ▼
        扩展 Service Worker（background.js）
             │ chrome.runtime.connectNative('com.mediahouse.scraper')
             ▼
        本机 MediaHouseScraperHost.exe（常驻，Native Messaging）
             ├─ commands.json（白名单 + 参数定义）
             ├─ 组装 argv → Process.Start(executable, argv[])   ← 不经过 shell
             ├─ stdout / stderr 逐行 → log 消息推回扩展
             └─ 取消 / 超时 → Kill(entireProcessTree: true)
```

**为什么这么绕**：浏览器的网页上下文不允许启动进程；只有通过 Native Messaging，
由本机注册过的宿主程序去执行，才能既在页面里点按钮，又保证网页无法执行任意命令。

---

## 安装（一次性）

### 1. 构建

```powershell
cd tools\browser-scraper
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

产物在 `dist\`：`MediaHouseScraperHost.exe`、`commands.json`、`scraper\scraper.py`。

> 需要 .NET 10 SDK。host 目标框架是 `net10.0-windows`（目录选择框用到 WinForms），只能在 Windows 上构建。

### 2. 配置命令

见下一章。**首次安装用默认的 `commands.json` 就能跑**，只是路径要改成你机器上的。

### 3. 加载扩展

1. `chrome://extensions`（或 `edge://extensions`）→ 打开「开发者模式」
2. 「加载已解压的扩展程序」→ 选 `tools\browser-scraper\extension`
3. 记下卡片上的扩展 ID（后面一般用不到，脚本会自动找）

### 4. 注册本机主机

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

- 不传 `-ExtensionId` 时，脚本会**自动**扫描 Chrome/Edge 的配置，找出「从本目录加载的那个扩展」
- 只写当前用户注册表（`HKCU`），不需要管理员权限
- 生成的清单是 `host-manifest.json`，**放在 dist 外面**，这样重建 `dist` 不会破坏注册

### 5. 配置站点（可以多个）

扩展选项页里**一行一个地址**：

```
http://192.168.1.10:8080
https://media.example.com
```

保存后**不用刷新**，面板会立刻出现在这些站点上。其他网站不会注入任何东西。

---

## 新增一条命令

### 只需要做一件事

在 `commands.json` 的 `commands` 数组里**加一个对象**。

改哪个文件：

| 文件 | 说明 |
|---|---|
| `host\commands.json` | **源文件，推荐改这个**，`build.ps1` 会把它复制到 `dist` |
| `dist\commands.json` | 运行时实际读取的；直接改也生效，但下次 rebuild 会被覆盖 |

### 生效流程

```
编辑 commands.json
        ↓
关掉面板，再点开右下角按钮          ← host 会重新读配置（热重载）
        ↓
下拉框出现新命令 → 选中 → 填参数 → 执行 → 看日志
```

**不需要**：重跑 `install.ps1`、重载扩展、重启浏览器、重启 host。
（改的是扩展的 JS 才需要重载扩展；换的是 host 的 exe 才需要刷新页面。）

### 模板 A：最简单的（无参数）

```json
{
  "id": "test",
  "name": "链路测试",
  "type": "process",
  "executable": "cmd.exe",
  "args": ["/c", "echo", "hello"],
  "timeoutSeconds": 30
}
```

### 模板 B：带参数和开关

```json
{
  "id": "ytdlp",
  "name": "下载视频",
  "description": "面板上显示在命令下拉框下面",
  "type": "process",
  "executable": "C:\\tools\\yt-dlp.exe",
  "args": ["${url}"],
  "workingDirectory": "G:\\downloads",
  "timeoutSeconds": 3600,
  "params": [
    { "key": "url",    "label": "地址",   "type": "text",      "required": true, "noArg": true },
    { "key": "format", "label": "格式",   "type": "text",      "placeholder": "best", "arg": ["-f", "${value}"] },
    { "key": "dir",    "label": "保存到", "type": "directory", "arg": ["-P", "${value}"] },
    { "key": "subs",   "label": "下字幕", "type": "boolean",   "default": "true", "flagTrue": "--write-subs" }
  ]
}
```

面板会渲染成：**地址输入框 + 格式输入框 + 目录选择器 + "下字幕"复选框**。

### 命令字段

| 字段 | 说明 |
|---|---|
| `id` | 唯一标识，扩展按它发命令 |
| `name` | 下拉框里显示的名字 |
| `description` | 下拉框下面的说明文字 |
| `type` | `process`（普通命令）或 `scrape-upload`（跑完打包上传回媒体库） |
| `executable` | 可执行文件路径；写相对名字会按 PATH 解析，**建议写绝对路径** |
| `args` | 基础参数数组，逐个传给程序，**不经过 shell** |
| `workingDirectory` | 工作目录，默认是可执行文件所在目录 |
| `timeoutSeconds` | 超时后杀进程，默认 600 |
| `params` | 面板上要显示的参数表单 |

### 参数字段（`params[]`）

| 字段 | 说明 |
|---|---|
| `key` | 参数名，同时也是 `${key}` 占位符的名字 |
| `label` | 面板上显示的名字 |
| `type` | `text` / `number` / `directory` / `file` / `boolean` |
| `default` | 默认值；可以写 `${num}` 这类占位符，运行时从页面上下文解析 |
| `placeholder` | 输入框提示文字 |
| `required` | 必填，留空会拒绝执行 |
| `noArg` | 只作为占位符在 `args` 里用，不额外追加到命令行 |
| `arg` | 有值时追加的参数模板，`${value}` 代表输入值 |
| `flagTrue` / `flagFalse` | `boolean` 专用：勾选加哪个开关、不勾选加哪个 |

### 占位符

`args`、`default`、`arg` 里都能用：

| 占位符 | 来源 |
|---|---|
| `${key}` | 同名参数的值 |
| `${value}` | 只在 `arg` 里有效，代表该参数的值 |
| `${num}` | 当前影片番号（页面上下文，优先） |
| `${mediaId}` / `${title}` / `${url}` | 当前详情页的 id / 标题 / 地址 |
| `${outputDir}` | `scrape-upload` 时由程序填成临时目录 |

> 展开顺序：**页面上下文（`context_*`）优先，其次是参数值**。所以 `jcatch -k ${key}`
> 即使面板留空，也会用当前影片的番号。

### 什么时候用 `noArg`

`jcatch.exe -k SSNI-443` 里，`SSNI-443` 是参数值本身，不需要配 `-k`——
但 `-k` 又必须出现在命令行里。这种情况把 `-k` 写进 `args`，参数本身标 `noArg`：

```json
"args": ["-k", "${key}"],
"params": [{ "key": "key", "label": "番号", "type": "text", "noArg": true }]
```

反过来，如果参数要靠 `--limit 5` 这种形式传递，就用 `arg`：

```json
"params": [{ "key": "limit", "type": "number", "arg": ["--limit", "${value}"] }]
```

### 注意事项

1. **路径转义**：JSON 里反斜杠要写两个（`C:\\tools\\x.exe`），或者用正斜杠 `C:/tools/x.exe`
2. **不要注册需要管理员权限的工具** —— host 以普通权限运行，UAC 弹窗会导致静默失败
3. **不要注册交互式工具**（等键盘输入的）—— 子进程 stdin 已关闭，会立即读到 EOF 退出
4. **JSON 支持 `//` 注释和结尾逗号**：

   ```json
   {
     // 这是允许的
     "args": ["-hide_banner"],   // 结尾逗号也行
   }
   ```

5. **JSON 写错不会把 host 弄崩**：面板日志会显示
   `[配置错误] commands.json 解析失败：...`，改好保存、重开面板即可

### 验证顺序（建议）

1. 先加一条 `cmd /c echo hello`，确认面板能列出、能执行、能看到输出
2. 再换成真实命令，参数一个一个加
3. 卡住的话看日志：`> 程序名 参数1 参数2` 这行是**实际执行**的命令行，先肉眼核对参数对不对

---

## 使用

1. 打开 MediaHouse 任意页面，右下角出现「🛠 本地工具」
2. 点开 → 选择命令 → 面板按 `params` 生成表单
3. 目录/文件类型的字段点「选择」弹系统选择框
4. 点「▶ 执行」，日志实时滚动；「■ 停止」可中断
5. 运行中按钮变绿「⏳ 运行中」，**收起面板不会中断命令**（刷新页面会）

日志保留最近 2000 行，可「复制日志」。
同一时间只允许跑一个命令，跑着时再点执行会提示。

---

## 内置动作：跑完打包上传

`type: "scrape-upload"` 用于「本地抓取 → 回传媒体库」：

1. 用页面 token 调 `GET /api/movies/{id}` 拿番号、标题、视频路径
2. 建临时目录，把 `${outputDir}` 指向它
3. 跑配置的 `executable`（参数照常拼）
4. 收集 `.nfo / .jpg / .jpeg / .png / .webp` 打包成 zip：
   - **平铺到压缩包根**，只保留 `extrafanart/` 这一层（服务端只接受这几种布局）
   - 任意层级的 `.nfo` 重命名为「视频同名.nfo」，保证覆盖旧的
5. `POST /api/media/{id}/update-metadata` 上传，服务端落盘并重扫

jcatch 的产出是 `<out>/<番号>/...`，正好在压缩包里被摊平成：

```
ABC-001.nfo
ABC-001-poster.jpg
ABC-001-thumb.jpg
ABC-001-fanart.jpg
extrafanart/extrafanart-1.jpg
```

---

## 实现细节

| 主题 | 行为 |
|---|---|
| **配置文件热重载** | 每次 `list` / `run` 都比较文件修改时间，改了就读新配置 |
| **临时目录** | 按顺序探测：`MH_SCRAPE_TMP` → `%TEMP%\mediahouse-scrape` → `%LOCALAPPDATA%\MediaHouse\scrape` → `<dist>\scrape-tmp`，用第一个可写的 |
| **子进程 TMP** | 启动子进程时把 `TMP`/`TEMP`/`TMPDIR` 指向上述目录（PyInstaller 打包的程序靠它解包） |
| **子进程 stdin** | 重定向后立即关闭，交互式程序读到 EOF 而不是吃掉协议数据 |
| **编码** | `PYTHONIOENCODING=utf-8`、`PYTHONUTF8=1`，输出按 UTF-8 解码 |
| **进度** | 日志里出现 `xx%` 自动转成状态栏进度 |
| **心跳** | 命令运行中每 20 秒发一次心跳，避免 MV3 Service Worker 空闲回收 |
| **清理** | 启动时删除一天前的临时目录（PyInstaller 被强杀会留下 `_MEIxxxx`） |
| **扩展断开** | 页面刷新/关闭 → 端口断开 → host 退出并杀掉子进程，不留孤儿 |

---

## 排错

| 现象 | 处理 |
|---|---|
| 右下角没有按钮 | F12 → Console：会提示「没配置站点」或「当前站点不在名单里」 |
| 「Specified native messaging host not found」 | 重跑 `install.ps1`；确认 `host-manifest.json` 存在 |
| 「与本机程序断开」 | ① 没跑 `install.ps1`；② 扩展 ID 变了；③ 清单里的 exe 路径不对 |
| 面板里没有某个命令 | `id` 重复？JSON 语法错？看日志里的 `[配置错误]` |
| 参数输入框没出现 | `params` 为空，或字段名写成了 snake_case（必须 camelCase） |
| 「找不到可执行文件」 | `executable` 写绝对路径 |
| 「无法启动命令」 | 路径含空格要写在 `args` 里；确认程序能双击运行 |
| PyInstaller 报 `Could not create temporary directory` | 已自动处理；若仍出现，设 `MH_SCRAPE_TMP` 到可写目录 |
| 重建 host 时报文件被占用 | 浏览器还连着 host：关掉面板刷新页面，或结束 `MediaHouseScraperHost.exe` |
| 日志中文乱码 | 命令输出不是 UTF-8；host 已设 UTF-8，程序自身需按 UTF-8 输出 |
| 命令一直没输出 | 有些程序（如 PyInstaller 打包的）解包就要 10~30 秒，先等；或看是不是在等 stdin |

---

## 自检脚本

```powershell
python tests\host_test.py  dist                                                # 协议：list / stdout / stderr / 取消
python tests\args_test.py  dist                                                # 参数拼装：默认值、开关、必填、上下文占位符
python tests\upload_test.py dist http://127.0.0.1:5099 <token> <mediaId>       # 搜刮上传全链路
```

> 前两个会临时覆盖目标目录里的 `commands.json`，建议对副本运行：
> `Copy-Item dist _tmp -Recurse` 然后对 `_tmp` 跑。

---

## 安全边界

- 扩展**不能**执行任意命令：只能从本机 `commands.json` 里按 id 选
- 参数走 `ProcessStartInfo.ArgumentList`（argv 数组），**不经过 shell**，不存在命令拼接注入
- 面板只在选项页里配置的站点生效，其他网站不注入
- host 是常驻进程，同一时间只跑一个命令；取消/超时会杀掉整个进程树
- ⚠️ 但请把它当成「本地任意代码执行」的入口：能改 `commands.json` 的人就能在你机器上跑程序

---

## 文件结构

```
tools/browser-scraper/
├─ build.ps1                 # 构建 host 到 dist
├─ install.ps1               # 注册 Native Messaging（自动探测扩展 ID）
├─ host-manifest.json        # 注册后被引用，放 dist 外面（重建不丢）
├─ host/
│  ├─ MediaHouseScraperHost.csproj
│  ├─ Program.cs             # 协议、命令执行、参数拼装、临时目录
│  └─ commands.json          # ★ 命令配置源文件
├─ extension/
│  ├─ manifest.json
│  ├─ background.js          # 页面 ↔ 本机 的双向转发
│  ├─ content.js             # 悬浮按钮 + 面板 UI
│  ├─ options.html / options.js
├─ scraper/scraper.py        # 不配 executable 时的兜底抓取脚本
├─ tests/
│  ├─ host_test.py           # 协议自检
│  ├─ args_test.py           # 参数拼装自检
│  ├─ upload_test.py         # 上传链路自检
│  ├─ fake_scrape.ps1        # 假的搜刮器（测试用）
│  └─ commands.test.json
└─ dist/                     # 构建产物（含 commands.json）
```
