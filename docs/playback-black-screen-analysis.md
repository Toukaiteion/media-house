# 播放黑屏问题分析报告

> 版本：2026-11-21　｜　分析对象：MediaHouse 播放页黑屏、刷新无响应、Emby 播放后恢复
> 说明：本报告基于代码静态分析 + 用户描述的环境，**结论为待验证的假设排序**，第六节给出 5 分钟可完成的验证步骤。

---

## 一、环境与现象

### 环境（用户确认）

| 项 | 情况 |
|---|---|
| 媒体存储 | **USB 外挂机械硬盘**，接在一台手掌大小的 Linux 小主机上 |
| 磁盘休眠 | 未确认（外置盒的休眠策略通常由桥接芯片固件决定，默认 10 分钟左右） |
| Emby | 网页版，部署在**同一台 Linux 主机、同一个目录、同一块盘** |
| MediaHouse | 同上，Docker 部署（nginx + Kestrel） |
| 客户端 | 局域网内另一台电脑的浏览器 |

### 现象

1. 播放一段时间后，或「打开 → 返回 → 再打开」重复多次之后，某次播放**黑屏不动**；
2. 此时**刷新页面也没有反应**；
3. 等一段时间会自己恢复；
4. **在 Emby 里播放任意另一个视频，再回到 MediaHouse 刷新，立刻恢复。**

第 4 条是最有价值的线索：它把「浏览器问题」的可能性压得很低，把「共享资源问题」的可能性抬得很高。

---

## 二、播放链路

```
浏览器 <video src="/api/media/{id}/stream">
   │  (可能伴随多次 Range 请求：0-、然后 seek)
   ▼
nginx (容器内 80)
   │  location /api/ → proxy_pass http://localhost:5000
   │  proxy_buffering 默认开启，proxy_read_timeout 300s
   ▼
Kestrel (.NET 10)
   │  MediaController.Play(mediaId)
   │    1. EF Core 查询 medias + media_files        ← 同步等待数据库
   │    2. File.Exists(filePath)                     ← 同步 stat，阻塞
   │    3. new FileStream(path, Open, Read)          ← 同步 open，阻塞
   │    4. File(stream, contentType, enableRangeProcessing: true)
   ▼
USB 外挂机械硬盘
```

对应代码：`media-house-admin/Controllers/MediaController.cs` 第 123–169 行；Kestrel 配置在 `Program.cs` 第 168–172 行。

---

## 三、结论

### 主假设（置信度 ~70%）：USB 机械盘瞬时不可用，把同步 I/O 卡在请求线程上，进而拖垮整个服务

外置 USB 机械盘在以下时刻会出现**秒级到几十秒级的 I/O 阻塞**：

- 盘片休眠后第一次读取（唤醒需要 5–15 秒，部分盒子更久）；
- USB 桥接芯片（JMS578 / ASM1153 / JMicron 等）在唤醒或高负载时触发 USB 复位，内核层面会挂住 30 秒左右；
- 单盘多路并发读取 → 磁头寻道风暴，吞吐从 ~100 MB/s 掉到个位数。

而代码里的 `File.Exists` 和 `new FileStream(...)` 都是**同步阻塞、无超时、无 CancellationToken** 的调用。一旦卡住：

```
盘未就绪 → Play 请求阻塞在内核 I/O
   → 浏览器收不到首字节，显示黑屏
   → 浏览器重试 / 改发新的 Range 请求（开→关→开 次数越多，挂起的请求越多）
   → 阻塞的请求占满 ASP.NET 线程池
   → 页面其它请求（列表、详情、刷新要加载的 JS/API）全部排队
   → 表现为「整个页面卡死，刷新也没反应」
   → 盘唤醒完成 / USB 设备恢复 → 积压请求一起返回 → 自己好了
```

### 为什么「Emby 播放一下就恢复」

Emby 读的是**同一块盘、同一个目录**。你在 Emby 里点播放，等于强制把盘唤醒/让 USB 设备重新响应；盘一旦可用，MediaHouse 那些被挂住的 `open()` 立刻返回，线程释放，页面瞬间恢复。

这条因果链只有「共享同一块物理盘」才能成立——而你确认了两者同盘同目录。

### 为什么「刷新没用」

刷新会让浏览器对同一个源重新发起请求，但：

- 浏览器对同一个 origin 只有 **6 条并发连接**（HTTP/1.1）；
- 旧的黑屏请求如果还挂在 nginx/Kestrel 上没释放，新请求只能排在后面；
- nginx 的 `proxy_read_timeout` 是 **300 秒**，一条卡住的上游请求最多能占 5 分钟。

所以「刷新没反应」不是前端坏了，而是**新的请求也堵在了同一条队列里**。

### 次假设（置信度 ~20%）：nginx 缓冲放大了首字节延迟

`docker/nginx.conf` 的 `/api/` 段没有关闭 `proxy_buffering`。默认开启时 nginx 会先向上游读一批数据再回给浏览器，视频流的首字节因此被推迟；上游一慢，浏览器看到的就是纯黑。同时浏览器中断播放后，nginx 仍会继续从 Kestrel 读，白白占用 I/O 和 worker。

### 再次假设（置信度 ~10%）：浏览器媒体解码器卡死

反复 `开 → 关 → 开` 同一视频、或标签页被切后台，Chrome 的硬件解码实例偶尔不复位。切换窗口（去 Emby）会让 Chrome 释放该标签的 GPU 资源，回来刷新就恢复。

这个假设同样能解释「Emby 之后恢复」，但它解释不了「等一会儿自己好」，也不该受磁盘影响。

---

## 四、代码中放大问题的 7 处

| # | 位置 | 问题 | 影响 |
|---|---|---|---|
| 1 | `MediaController.Play` L152 | `File.Exists(filePath)` 同步 stat，无超时 | 盘卡顿时请求线程直接挂住 |
| 2 | `MediaController.Play` L160 | `new FileStream(..., FileMode.Open, FileAccess.Read)` 同步 open，无 `FileOptions.Asynchronous` | 同上；且不支持取消 |
| 3 | `MediaController.Play` L136–138 | 流请求里先做一次 EF Core 查询（含 `Include(MediaFiles)`） | SQLite 写事务期间会额外等待，叠加 I/O 卡顿 |
| 4 | `MediaController.GetMediaFile` L46 / `GetImageByUrlName` L108 | 同样的同步 `FileStream` 写法 | 封面图也会卡住，列表页可能整片空白 |
| 5 | `Program.cs` L170 | `KeepAliveTimeout = 10min` | 卡住的连接长时间不被回收 |
| 6 | `docker/nginx.conf` `/api/` | 未关 `proxy_buffering`；`proxy_read_timeout 300s` | 首字节延迟 + 卡住的上游请求占用 worker 5 分钟 |
| 7 | 前端 `PlayerPage`（旧版） | 未在离开时显式释放视频（`pause()` + `removeAttribute('src')` + `load()`） | 旧请求可能残留在浏览器连接池 |

另外，`FileStreamResult` 是**托管缓冲区拷贝**，没有走 Linux 的 `sendfile`。大文件顺序读取会额外占用 CPU 和线程——这不是黑屏的直接原因，但在单盘低带宽场景下会放大抖动。

---

## 五、与现象逐条对照

| 现象 | 主假设能否解释 | 说明 |
|---|---|---|
| 看一段时间后黑屏 | ✅ | 播放期间盘在忙；暂停/缓冲时盘进入空闲，之后一次 seek 触发了等待 |
| 反复开关后更容易出现 | ✅ | 每次开关都产生新的 open + Range，挂起请求累积 |
| 刷新没反应 | ✅ | 线程池/连接池被占满，新请求排队 |
| 等一会儿自己恢复 | ✅ | 盘唤醒完成或 USB 复位恢复，积压请求一起返回 |
| **Emby 播放后立刻恢复** | ✅✅ | 同盘同目录，Emby 的读取强制唤醒了盘 |
| 只有视频黑屏、页面其它部分曾经正常 | ⚠️ | 早期可能只是单请求卡住；拖久了才演变成整页卡死 |

---

## 六、下次复现时的验证步骤（5 分钟，按顺序做）

> 前提：**黑屏当下先别刷新、别去开 Emby**，先把现场固定住。

### A. 从另一台机器打服务端（判定「服务端卡住」还是「浏览器卡住」）

```bash
curl -o /dev/null -w 'code=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
     -r 0-1024 -H "Authorization: Bearer <token>" \
     http://<服务器IP>/api/media/<媒体ID>/stream
```

- `ttfb > 2s` 或直接超时 → **服务端/存储问题**（支持主假设）
- 秒回 `206` → 服务端正常，问题在浏览器（支持次假设）

### B. 在服务器上判断「盘是不是卡住」（最关键的一条）

```bash
# 直接读盘，绕过页缓存（iflag=direct）。卡住 = 盘/桥接问题
time dd if=/你的媒体目录/某个.mp4 of=/dev/null bs=1M count=1 iflag=direct

# 盘当前状态：active / idle / standby
sudo hdparm -C /dev/sdX

# 内核有没有 USB 复位 / I/O 错误
dmesg -T | tail -50 | grep -Ei 'usb|uas|reset|I/O error|sd [a-z]'
```

- `dd` 卡住或 `dmesg` 出现 `reset SuperSpeed USB device`、`uas_eh_abort_handler` → **实锤主假设**
- `/dev/sdX` 显示 `standby` → 确认存在休眠

### C. 确认连接/线程是否被占满

```bash
ss -tanp | grep -E ':80|:5000' | awk '{print $1}' | sort | uniq -c
docker logs --since 10m <容器名> 2>&1 | tail -50
iostat -x 1 3        # 看 %iowait 和 await
```

- 大量 `ESTAB` 停在 `:80` 且 `iowait` 很高 → 与主假设一致

### D. 浏览器侧（F12 → Network）

- 找到 `stream` 请求：状态是 `pending`（服务端慢）还是 `200` 但画面不亮（解码器）；
- Timing 里看 **TTFB**；是否同时有多条同 URL 的请求挂着。

### E. 30 秒判别实验（区分主假设与次假设）

黑屏时**不碰 Emby**，只把浏览器切到别的标签页/最小化 10 秒再回来刷新：

- 恢复 → 更可能是浏览器解码器（次假设）
- 仍不恢复，必须让 Emby 播一下才行 → 更可能是磁盘（主假设）

---

## 七、修复建议（按投入产出排序，暂不实施）

### 短期（配置层，零代码，先止血）

1. **关掉硬盘休眠**
   ```bash
   sudo hdparm -B 255 /dev/sdX          # 关闭 APM 休眠（对部分 USB 盒无效）
   sudo hdparm -S 0 /dev/sdX            # 关闭 spindown 计时
   ```
   USB 盒若由桥接固件控制，则加一个定时保活：
   ```bash
   # 每 5 分钟读 1MB，阻止盘进入 standby
   */5 * * * * dd if=/媒体目录/某个小文件 of=/dev/null bs=1M count=1 iflag=direct
   ```
2. **nginx 针对流关闭缓冲**
   ```nginx
   location /api/ {
       proxy_buffering off;
       proxy_request_buffering off;
       proxy_read_timeout 300s;
   }
   ```
3. 顺便确认 USB 供电：小主机 USB 口供电不足会导致盘在负载下掉线重连，用**带独立供电的硬盘盒或 USB Hub**。

### 中期（代码层）

4. **流接口改成全异步 + sendfile**
   - 用 `Results.File(physicalPath, contentType, enableRangeProcessing: true)` / `PhysicalFileResult`，Kestrel 走 `sendfile(2)`，不再用托管缓冲拷贝；
   - 或 `new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan)`；
   - 去掉 `File.Exists`，直接 open 并捕获 `FileNotFoundException`（少一次 stat，也就少一次可能卡住的系统调用）。
5. **把 `HttpContext.RequestAborted` 传下去**：用户点返回时立刻释放文件和线程。
6. **流请求不要查库**：`/media/{id}/stream` 只做"id → 路径"的必要查询，别 `Include(MediaFiles)`；或者启动时把 id→path 缓存到内存。
7. **给文件 I/O 加超时**：用 `CancellationTokenSource(timeout)` 包住 open/首字节读取，超时返回 503 + 明确提示，而不是无限挂着。
8. **降低 Kestrel `KeepAliveTimeout`**（10 分钟 → 1~2 分钟），减少僵死连接占用。

### 长期

9. 媒体目录换 SSD 缓存层，或至少把 **Emby 和 MediaHouse 的并发读** 做错峰（同一块单盘同时两个流必然抢磁头）。
10. 若继续用 USB 盘：优先 USB 3.0 + UASP 支持的盒子，并确认内核用的是 `uas` 驱动而不是 `usb-storage`（`lsusb -t` 里能看到 `uas`）。

---

## 八、仍需确认的信息

1. 黑屏时 `dmesg` 里有没有 `reset SuperSpeed USB device` / `uas_eh_abort_handler`（这条几乎可以直接定案）；
2. `/dev/sdX` 的 `hdparm -C` 在黑屏瞬间是 `active` 还是 `standby`；
3. USB 硬盘盒型号 / 是否有独立供电；
4. 黑屏时从另一台机器 `curl` 那个 stream 接口的 TTFB；
5. Emby 与 MediaHouse 是否**同时**播放时会互相影响（可以主动做一次压测：两边同时播放，观察是否一起卡）。

---

## 附：一句话总结

> 一块会休眠的 USB 机械盘 + 一条不走 sendfile 且无超时的同步读文件路径 + 一个只有 6 条连接、还会缓冲视频流的 nginx，三者叠加。
> Emby 之所以能"治好"它，是因为两者共用同一块盘——Emby 的读取把盘唤醒了。
