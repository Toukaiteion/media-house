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

### 批量命令：`hidden` + `snippets`

批量任务（jscan / jsearch）跑起来是几十分钟、参数还多，放在下拉里容易误点。
所以它们用两个机制改成了"给条命令让你去终端跑"：

**① `hidden: true` —— 不进下拉，但仍可执行**

```json
{ "id": "jscan", "name": "jscan 扫描目录批量搜刮", "hidden": true, ... }
```

面板的命令下拉会过滤掉它，`run` 接口仍能按 id 调用（自动化脚本不受影响）。

**② `snippets` —— 面板里显示 + 一键复制**

```json
"snippets": [
  {
    "name": "jscan · 先看计划（不动文件）",
    "description": "列出会处理哪些番号，确认无误再正式跑",
    "command": "node \"${hostDir}\\scraper\\scan-scraper.mjs\" \"G:\\迅雷下载\" -o \"F:\\迅雷下载\\emby_out\" -m 1G -l 0 --dry-run"
  }
]
```

- 面板会在参数区下方渲染成一列，每条有「复制」按钮（`navigator.clipboard`，
  失败退回 `execCommand`），点了显示「已复制」
- `command` 里可以用 `${hostDir}`，host 返回时会展开成真实路径，粘到终端直接能跑
- 命令里别带 `cd`：用绝对路径，PowerShell 和 cmd 都能直接粘贴

### 面板的两个页签

面板顶部有「单部搜刮 / 批量任务」两个页签：

- **单部搜刮**：命令下拉 + 参数表单 + 执行/停止（原来的界面）
- **批量任务**：`snippets` 列表，每条一个「复制」按钮

批量命令不在下拉里，所以第一次找的时候记得点「批量任务」页签。

### 双击运行：`jscan-batch.bat`

不想开终端敲命令的话，直接双击 `dist\jscan-batch.bat`：

```
============================================
  输入目录: G:\迅雷下载
  输出目录: F:\迅雷下载\emby_out
============================================
  1. 只看计划（不动任何文件）
  2. 正式跑（搜刮 + 移动）
  3. 只整理不搜刮（不联网）
--------------------------------------------
请选择 [1/2/3，直接回车 = 1]:
```

选完就跑，跑完停住等你看结果。

> 这里有个编码坑：`.bat` 是 cmd 按 GBK 解析的，里面直接写中文路径（`G:\迅雷下载`）
> 会乱码。所以 `.bat` 只有三行 ASCII，菜单和路径都在 `scraper\batch-menu.mjs`
> （Node 读文件是 UTF-8，不受影响）。

可以在桌面建个快捷方式指向它，双击即用：

```powershell
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\批量搜刮.lnk")
$lnk.TargetPath = "G:\project\MediaHouse\tools\browser-scraper\dist\jscan-batch.bat"
$lnk.WorkingDirectory = Split-Path $lnk.TargetPath
$lnk.Save()
```

### 为什么面板不能直接帮你开终端

试过三种方式，都不可行（浏览器派生的进程被降权到 Low 完整性级别时）：

| 方式 | 结果 |
|---|---|
| `Process.Start("cmd")` | 子进程继承 Low 令牌，一样写不了 F: |
| COM `Shell.Application.ShellExecute` | Low 客户端激活被拒，什么都没发生 |
| `schtasks /create` + `/run` | Low 下创建失败（Medium 下正常），且 `/tr` 里的重定向会被吃掉 |
| `explorer.exe <file>` | 不可靠，连 Medium 下都没跑起来 |

所以「一键」只能做到：**复制命令**（面板里）+ **双击 .bat**（桌面）。

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

## 三个采集器怎么选

| | jfetch（纯 HTTP） | jrender（Playwright） | jcatch（Selenium） |
|---|---|---|---|
| 脚本 | `scraper\http-scraper.mjs` | `scraper\browser-scraper.mjs` | `bin\jcatch.exe` |
| 单部耗时 | **1~2 秒** | 3~8 秒 | 5~20 秒 |
| 依赖 | Node ≥ 18 | Node + `playwright` 包 | Python + chromedriver |
| 需要 chromedriver | 否 | **否** | 是（版本要匹配） |
| JS 渲染页面 | ❌ | ✅ | ✅ |
| 年龄验证 | 需要你给 Cookie | **自动点，失败才要 Cookie** | 看站点 |
| 启动开销 | 极低 | 中（起一次浏览器） | 高 |

**建议顺序**：jrender → 失败 → jfetch → 再不行 → jcatch。

> 批量整理（扫描目录 → 逐个搜刮 → 移动归档）用 `jscan`，见下面的专门章节；
> 它是 jsearch 的 Playwright 版，但不需要 chromedriver。

两个 node 脚本共用 `scraper/parse-detail.mjs`（解析 + NFO）和 `scraper/image-ops.mjs`
（海报裁切），改一处两边生效。`scraper/scrape-core.mjs` 是浏览器会话与落盘的共享实现，
jrender 和 jscan 都跑它。

> **poster 裁切**：javbus 的封面是横向拼图（左边封底、右边正面），所以
> poster 取**右半**，fanart / thumb 保留整张；本来就是竖版的封面不裁。
> 实现用的是 PowerShell + System.Drawing（Windows 自带），不引 native 模块；
> 非 Windows 或裁切失败时退回整张图，不影响搜刮结果。

## jfetch：不用浏览器的采集（速度优先）

`dist\scraper\http-scraper.mjs` 是一个**纯 HTTP + 正则**的采集器，零依赖，
不启动 Chrome。思路来自「站点是服务端渲染的，HTML 里就有全部数据」——
那就没必要为了一次抓取起一个浏览器。

### Cookie 怎么拿

javbus 会弹年龄验证。在浏览器里正常打开一次详情页过掉验证，然后：

```
F12 → Network → 任意请求 → 复制请求头里整段 Cookie
```

粘到两个地方之一：

1. 面板上的「Cookie」输入框（每次都要填）
2. **`dist\scraper\cookie.txt`**（推荐，写一次就够）

脚本会自动补 `existmag=all`——这个字段决定列表范围，从浏览器复制时最常漏。

### 直接拿它当命令行用

```powershell
node dist\scraper\http-scraper.mjs -k SSIS-778 -o G:\tmp\out
node dist\scraper\http-scraper.mjs -k SSIS-778 -o G:\tmp\out --origin https://busdmm.casa
node dist\scraper\http-scraper.mjs -k SSIS-778 -o G:\tmp\out --html saved.html --no-images   # 离线调试
```

产物和 jcatch 一致（`<out>/<番号>/…`），所以能直接挂 `scrape-upload` 命令。

| 退出码 | 含义 |
|---|---|
| 0 | 成功 |
| 2 | 站点要年龄验证 → 去填 Cookie |
| 3 | 页面上找不到这个番号（或站点改版） |
| 1 | 其它错误（网络、参数等） |

### 解析坏了怎么办

`--debug-html` 会把抓到的原始页面存到 `<out>/<番号>/debug.html`，
改正则时对着它调；`--html <文件>` 可以完全离线跑解析和落盘，不用联网。

> 解析逻辑在 `parseDetailPage()`（纯函数，`scraper/parse-detail.mjs`），
> 字段用多语言标签匹配（`識別碼/识别码/番号`），站点换语言不影响。

## jrender：Playwright 版（能过验证 / 渲染慢页面）

`dist\scraper\browser-scraper.mjs` 用真浏览器渲染页面，并会**主动点掉年龄验证**，
所以大部分情况不需要 Cookie。它和 jfetch 的唯一区别就是「怎么拿到 HTML」，
解析、NFO、落盘、退出码完全一致。

浏览器按这个顺序找，通常不用额外下载：

```
1. 系统 Chrome（channel="chrome"）
2. C:\Program Files\Google\Chrome\Application\chrome.exe 等常见路径
3. Playwright 自带 chromium（需 npx playwright install chromium）
```

```powershell
node dist\scraper\browser-scraper.mjs -k SSIS-778 -o G:\tmp\out
node dist\scraper\browser-scraper.mjs -k SSIS-778 -o G:\tmp\out --no-headless   # 看得见窗口
node dist\scraper\browser-scraper.mjs -k SSIS-778 -o G:\tmp\out --html saved.html --no-images
```

### 它依赖 playwright 包

`tools\browser-scraper\package.json` 里声明了依赖，装一次就行（约 40MB）：

```powershell
cd tools\browser-scraper
npm install
```

`dist\scraper\*.mjs` 会向上找到 `tools\browser-scraper\node_modules`，所以
**构建时不复制 node_modules**，不会拖慢 `build.ps1`。

> 没装 playwright 的话，jfetch 照常能用——只有 jrender 会报
> 「没有安装 playwright」。

---

## jscan：批量扫描 + 整理（jsearch 的 Playwright 版）

`dist\scraper\scan-scraper.mjs` 干的是 jsearch 的活，但不依赖 jcatch / chromedriver：

1. 递归扫描目录，挑出体积达标的视频（默认 ≥ 1G）
2. 从文件名解析番号，**会学习前缀**，与 jsearch 共用 `~/.jsearch/prefixes.json`
3. 逐部用浏览器抓元数据，写进 `<输出>/<番号>/`
4. 视频改名成 `<番号>.mp4` 一并挪进去（跨盘自动退化成复制 + 删除）

```powershell
node dist\scraper\scan-scraper.mjs G:\迅雷下载 -o F:\迅雷下载\emby_out -m 1G -l 3
node dist\scraper\scan-scraper.mjs G:\迅雷下载 -o F:\迅雷下载\emby_out --dry-run      # 只看计划
node dist\scraper\scan-scraper.mjs G:\迅雷下载 -o F:\迅雷下载\emby_out --skip-scrape  # 只整理不搜刮
```

产物：

```
<输出>\SSIS-969\
├─ SSIS-969.nfo
├─ SSIS-969-poster.jpg     封面右半（裁过）
├─ SSIS-969-fanart.jpg     整张
├─ SSIS-969-thumb.jpg      整张
├─ SSIS-969.mp4            源视频，改名后移动过来
└─ extrafanart\extrafanart-1.jpg ...
```

| 行为 | 说明 |
|---|---|
| **幂等** | 「元数据 + 视频」**两样都就位**才跳过；只差一半会补做（例如上次移动被拒，这次只移动、不重新搜刮）。`--force` 全部重做 |
| **多版本** | 同番号只处理体积最大的那份，其余留在原处并在日志里列出 |
| **限速** | 每部之间随机等 5~10 秒（`--delay 3-6` 可调，测试用 `--delay 0`） |
| **跳过输出目录** | 输出目录在扫描目录内时不会被自己扫到 |
| **退出码** | 0 全部成功 / 1 有失败 / 2 需要 Cookie / 3 没找到可处理的视频 |

### 参数速查

| 参数 | 默认 | 说明 |
|---|---|---|
| `<目录>` | 必填 | 扫描哪个目录（位置参数，不带选项名） |
| `-o, --output` | 当前目录 | 整理到的输出目录 |
| `-m, --min-size` | `1G` | 体积下限，支持 `1G` / `1.5G` / `500M` / `1024`（按 MB） |
| `-l, --limit` | `3` | 本次最多处理几部，`0` = 不限 |
| `--headless` / `--no-headless` | 有头 | 浏览器是否隐藏窗口；排查问题时用 `--no-headless` |
| `--delay <min-max>` | `5-10` | 每部之间随机等待秒数，`--delay 0` 关闭 |
| `--origin` | `https://www.javbus.com` | 站点地址，直连不通可换镜像 |
| `--cookie` | 空 | 年龄验证用的 Cookie；留空自动读 `scraper\cookie.txt` |
| `--cookie-file` | `scraper\cookie.txt` | Cookie 文件路径 |
| `--timeout <秒>` | `30` | 页面加载超时 |
| `--dry-run` | 关 | 只列计划，不动任何文件 |
| `--skip-scrape` | 关 | 只整理视频，不联网搜刮 |
| `--force` | 关 | 已完成的也重做（重新搜刮 + 重新移动） |
| `--copy` / `--move` | `--move` | 复制还是移动源文件（跨盘时两者都要传输） |
| `--prefix-file` | `~\.jsearch\prefixes.json` | 番号前缀库，与 jsearch 共用 |
| `--debug-html` | 关 | 把抓到的原始页面存到 `<输出>\<番号>\debug.html` |

推荐组合（也是面板里 snippets 的默认值）：`-m 1G -l 10 --headless`

> 「搜刮」和「移动」是两件独立的事，分开判断：
> 视频已在目标目录（扩展名不同也认）就不再移动，保留源文件；
> 元数据已存在就不再搜刮。跳过已完成的条目时会提示那些仍留在输入目录的源文件，
> 方便确认后手动清理重复副本。

### 报 EPERM 写不进输出目录（面板里跑批量时常见）

在面板里点 jscan，可能看到：

```
[jscan] 无法写入输出目录：F:\迅雷下载\emby_out
  (EPERM) 当前进程跑在 Low 完整性级别 —— 浏览器被安全软件"防护/沙箱"限制时就是这样
```

**这不是工具的问题，是 Windows 的强制完整性控制**：浏览器派生的进程被降到 Low
完整性级别，而 `F:\迅雷下载\emby_out` 是资源管理器创建的（Medium），
低级别进程不能往上写。

这也解释了为什么「下载元数据、打包、上传」一直正常：那些文件写在
`<dist>\scrape-tmp\<runId>\`，是**进程自己创建的**目录，自带 Low 标签，所以能写。

三个办法（任选其一）：

**① 给输出目录降级**（一次搞定居委会，需管理员）

```powershell
# 管理员 PowerShell；括号必须加引号
icacls "F:\迅雷下载\emby_out" /setintegritylevel "(OI)(CI)L"
```

- `(OI)(CI)` = 目录本身 + 所有子目录/文件都继承
- `L` = Low（可选 `M` / `H` / `S`），把目录标签从 Medium 降到 Low 后，Low 进程就能写
- 还原：`icacls "F:\迅雷下载\emby_out" /setintegritylevel "(OI)(CI)M"`
- 代价：Low 级别进程（沙箱里的浏览器）也能改这个目录，保护性略降

**② 用终端跑批量任务**（不需要任何权限改动）

```powershell
cd tools\browser-scraper
node dist\scraper\scan-scraper.mjs G:\迅雷下载 -o F:\迅雷下载\emby_out -m 1G -l 3
```

**③ 安全软件加白**：把 `node.exe` 和 `MediaHouseScraperHost.exe` 加进信任区，
或关掉安全软件的「浏览器防护 / 文档保护」。

> 单部搜刮（jrender / jfetch）不受影响，它们只写自建的 `scrape-tmp`。

**还有一个连带问题：移动会卡在源文件上。** 降级只解决了「在目标目录里创建」，
而 `rename` 的本质是「从源删除 + 在目标创建」——源文件是迅雷/资源管理器创建的
（Medium 标签），Low 进程删不掉，于是报：

```
EPERM: operation not permitted, rename 'G:\迅雷下载\IPOK-026\xxx.mp4'
       -> 'F:\迅雷下载\emby_out\IPOK-026\IPOK-026.mp4'
```

现在遇到这种情况会**退化成复制**（读源文件不需要高权限），日志提示源文件仍在原地：

```
视频已复制到 F:\迅雷下载\emby_out\IPOK-026\IPOK-026.mp4
源文件权限不足删除失败，仍在原地，请稍后手动清理：G:\迅雷下载\IPOK-026\xxx.mp4
```

下一轮再跑会把它算成「已完成」并列出这些待清理的源文件。
想一次性搬干净，还是在**终端**里跑（终端进程是 Medium，能删）。

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
