# MediaHouse 本地搜刮（浏览器扩展 + Native Messaging）

在 MediaHouse 的**影片详情页**点一个按钮，用**本机 Python** 去目标站搜刮元数据，
然后自动上传回服务器并触发重扫。

```
详情页「本地搜刮」按钮
   │ chrome.runtime.connect('mh-scrape')
   ▼
扩展 background (service worker)
   │ chrome.runtime.connectNative('com.mediahouse.scraper')
   ▼
本机 MediaHouseScraperHost.exe      ← Native Messaging 主机（4 字节长度 + JSON）
   │ ① GET /api/movies/{id}  → 拿 file_path，确定 nfo 该叫什么叫
   │ ② 启动 python scraper.py（stdin JSON / stdout JSON / stderr 进度）
   │ ③ 打包 zip：只收 .nfo/.jpg/.png/.webp，nfo 重命名为「视频同名.nfo」
   ▼
   │ ④ POST /api/media/{id}/update-metadata  (multipart, 字段 file)
   ▼
服务端：解压 → 覆盖到影片目录 → ScanSingleMovieAsync 重扫 → 页面刷新
```

**后端零改动**，复用的是前端「上传元数据」已经在用的那个接口。

---

## 目录结构

```
tools/browser-scraper/
├── extension/            # Chrome/Edge 扩展（MV3）
│   ├── manifest.json
│   ├── content.js        # 详情页按钮 + 进度提示
│   ├── background.js     # Port ↔ Native Messaging 桥接
│   └── options.html/js   # 填服务器地址
├── host/                 # Native Messaging 主机（C#）
│   ├── Program.cs        # 协议帧、调 Python、打包、上传
│   ├── host.config.json  # python / scraper 路径、超时
│   └── MediaHouseScraperHost.csproj
├── scraper/scraper.py    # ★ 你要改的就是这里：scrape()
├── tests/e2e_test.py     # 离线自检（假服务器，不需要浏览器）
├── build.ps1             # dotnet publish + 复制配置
└── install.ps1           # 写注册表，注册主机
```

---

## 安装（Windows，一次性）

### 1. 构建主机

```powershell
cd tools\browser-scraper
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

产物在 `dist\`，包括 `MediaHouseScraperHost.exe`、`host.config.json`、`scraper\scraper.py`。

> 如果 `dotnet publish` 报找不到 .NET 10，装一下 SDK；如果公司网络拉不到 NuGet，用一个能连的镜像源。

### 2. 加载扩展

1. `chrome://extensions`（或 `edge://extensions`）
2. 打开右上角「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 `tools\browser-scraper\extension`
4. **复制显示出来的扩展 ID**（32 位字母）

> ⚠️ 扩展 ID 和「加载的目录路径」绑定。**移动/重命名这个目录后 ID 会变**，需要重新执行第 4 步。
> 想彻底固定，可以在 `manifest.json` 里加 `"key"` 字段（把扩展打包成 crx 时导出公钥）。

### 3. 注册本机主机

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId 你的32位扩展ID
```

它会：
- 生成 `dist\com.mediahouse.scraper.json`（`allowed_origins` 只允许你那个扩展 ID）
- 写注册表 `HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\...` 和 Edge 的同名键
- 只写当前用户，**不需要管理员权限**

### 4. 配置

- 打开扩展选项（`chrome://extensions` → 详情 → 扩展选项），填服务器地址，例如 `http://192.168.1.10:8080`，保存。
- 按需修改 `dist\host.config.json`：

```json
{
  "python": "python",
  "scraper": "scraper\\scraper.py",
  "timeout_seconds": 300
}
```

`python` 可以写绝对路径（比如带虚拟环境的 `C:\\venv\\Scripts\\python.exe`）。
如果用了虚拟环境，建议直接写 venv 里的 python，省得依赖没装。

### 5. 用

1. 在 MediaHouse 页面登录一次（扩展复用 `localStorage` 里的 token）
2. 进任意影片详情页 `/media-center/movies/{id}`
3. 右下角出现「🔄 本地搜刮」，点它
4. 进度实时显示，完成后自动刷新页面

---

## 换成你自己真正的抓取逻辑

只有一处要改：`scraper/scraper.py` 里的 `scrape()`。

入参 `request`：

```python
{
  "action": "scrape",
  "media_id": "12",
  "title": "影片标题",
  "num": "ABC-123",                    # 番号，来自数据库 Movie.Num
  "file_path": "/media/Movies/ABC-123/ABC-123.mp4",
  "output_dir": "C:\\Users\\...\\Temp\\mediahouse-scrape\\12"
}
```

要求：
1. 把图片 / NFO 写进 `output_dir`（nfo 叫什么都行，主机会重命名成「视频同名.nfo」）
2. 向 `stderr` 打进度行，主机会转成浏览器进度条：
   ```python
   {"type":"progress","step":"searching","message":"正在搜索…","percent":20}
   ```
3. 最后向 `stdout` 打**一行** JSON：
   ```json
   {"status":"success","metadata":{...},"created_files":{...}}
   ```

`created_files` 目前不被主机强依赖（主机直接扫 `output_dir` 里白名单后缀的文件），保留是为了符合插件规范。

现成的 `jcatch-jav-scraper` 想复用的话，把它 `bin/` 下的可执行文件塞进 `dist/scraper/`，
把 `host.config.json` 的 `python` 留空、`scraper` 指向那个 exe 即可（主机只认 `python + 脚本` 这一种形态的话，
就写个 5 行的 python wrapper 去 `subprocess` 调它）。

---

## 自检 / 排错

**离线端到端自检**（不需要浏览器、不需要真实服务器）：

```powershell
python tests\e2e_test.py
```

它会起一个假 API、按 Chrome 的协议调用 host，校验进度帧、zip 结构（nfo 是否改名为 `TEST-001.nfo`、
有没有混进视频文件）、Authorization 头。

### 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 按钮不出现 | 选项里服务器地址没填或和当前页面 origin 不一致（扩展只在自己服务器上生效） |
| 点按钮报「与本机程序断开」 | ① 没跑 `install.ps1`；② 扩展 ID 变了没重注册；③ `dist\...json` 路径不对 |
| 报「找不到搜刮脚本」 | `host.config.json` 里 `scraper` 路径不对，它是相对 exe 目录的 |
| 报「无法启动 Python」 | `python` 不在 PATH，写绝对路径 |
| 报 401 | 页面登录过期了，重新登录一次再点 |
| 服务器 400「Invalid archive content」 | zip 结构不对：只能是扁平、单层目录、或扁平 + `extrafanart` 三种 |
| 提示 host 找不到 | Chrome 没读到注册表键；确认用的是同一个用户、Chrome 完全重启过 |
| 改完 Python 没生效 | 主机每次点按钮都会重新拉起 python，不需要重启浏览器；只有改 `Program.cs` 才需要重新 `build.ps1` |

### 调试

Chrome 里看：
- `chrome://extensions` → 扩展「Service Worker」→ 看 background 日志
- 详情页 F12 → Console → 看 content script 日志

本机看：`%TEMP%\mediahouse-scrape\<mediaId>\` 里有 Python 产出的原始文件，能直接确认抓到了什么。

---

## 安全说明

- **能调用这个主机的只有你那个扩展**：`allowed_origins` 精确到扩展 ID，网页 JS 无法触达。
- 主机**不执行任意命令**：只固定调用 `host.config.json` 里配置的那一个 Python 脚本。
- 上传的 zip **只打包 `.nfo/.jpg/.jpeg/.png/.webp`**，且单文件 >12MB 跳过、总量 >40MB 中止。
  **绝不会把视频打进 zip** —— 服务端是覆盖式复制，混进同名 mp4 会覆盖原片。
- token 由页面读出来传给本机 host，host 直接 POST；token 不落盘、不写日志。
- 扩展的 `content_scripts.matches` 是 `http://*/*`，但它会先校验 origin，不在白名单站点上直接退出。
  想更严格就把 `matches` 改成你的服务器地址。
