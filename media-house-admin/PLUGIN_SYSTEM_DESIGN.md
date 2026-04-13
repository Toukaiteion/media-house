# 搜刮插件管理模块设计文档

## 一、概述

本文档设计一个用于管理媒体内容搜刮插件的模块，允许用户安装、配置和运行Python搜刮脚本来自动获取媒体元数据。

**插件形式：打包插件（自包含）**
- 插件打包时已经包含所有依赖和虚拟环境
- 系统只需管理配置和执行，无需处理Python依赖
- 插件可执行文件位于插件目录中（如 `bin/scraper` 或 `run.sh`）

## 二、插件定义与运行标准

### 2.1 插件输入输出标准

**标准接口：**

插件通过标准化的JSON格式进行输入输出通信。

#### 输入格式 (stdin)
```json
{
  "action": "scrape",
  "source_dir": "/path/to/movie/directory",
  "output_dir": "/path/to/output/directory",//可选
  "config": {
    "language": "zh-CN",
    "poster_quality": "high",
    "custom_fields": {}
  }
}
```

#### 输出格式 (stdout)
```json
{
  "status": "success",
  "message": "Scraping completed",
  "metadata": {
    "title": "电影标题",
    "original_title": "原始标题",
    "year": "2024",
    "release_date": "2024-01-01",
    "summary": "剧情简介",
    "runtime": 120,
    "studio": "制作公司",
    "maker": "发行商",
    "num": "唯一标识号",
    "tags": ["标签1", "标签2"],
    "actors": ["演员1", "演员2"],
    "images": {
      "poster": "poster.jpg",
      "thumb": "thumb.jpg",
      "fanart": "fanart.jpg"
    }
  },
  "created_files": {
    "nfo": "movie.nfo",
    "poster": "poster.jpg",
    "fanart": "fanart.jpg",
    "screenshots": ["shot1.jpg", "shot2.jpg"]
  },
  "statistics": {
    "total_time_ms": 5000,
    "api_requests": 3
  }
}
```

### 2.2 运行状态通知标准

插件通过stderr输出进度通知，格式为JSON行的progress事件：

```
{"type": "progress", "step": "searching", "message": "Searching for movie...", "percent": 10}
{"type": "progress", "step": "downloading", "message": "Downloading poster...", "percent": 50}
{"type": "progress", "step": "saving", "message": "Saving metadata...", "percent": 80}
{"type": "error", "message": "An error occurred"}
```
支持的消息类型：
- `progress`: 进度消息
- `error`: 报错消息

支持的进度步骤类型：
- `initializing`: 初始化中
- `searching`: 搜索中
- `downloading`: 下载资源中
- `parsing`: 解析数据中
- `saving`: 保存文件中
- `completed`: 完成

### 2.3 插件文件结构

```
plugins/
├── av-mogu/1.0.0/          # 插件目录（插件ID/版本）
│   ├── plugin.json           # 插件定义文件（必需）
│   ├── bin/                 # 可执行文件目录
│   │   ├── scraper          # 主执行程序（Linux/macOS）
│   │   ├── scraper.exe      # 主执行程序（Windows）
│   │   └── python/         # Python虚拟环境（可选，如果需要）
│   ├── README.md            # 说明文档（可选）
│   └── icon.png            # 插件图标（可选）
└── javbus/1.2.0/
    ├── plugin.json
    ├── bin/
    │   └── scraper
    └── ...
```

### 2.4 插件定义文件 (plugin.json)

```json
{
  "id": "av-mogu",
  "name": "AVMOGU搜刮器",
  "version": "1.0.0",
  "description": "从AVMOGU网站获取成人电影元数据",
  "author": "MediaHouse",
  "homepage": "https://github.com/mediahouse/av-mogu-scraper",
  "supported_media_types": ["movie"],
  "supported_languages": ["zh-CN", "en-US"],
  "config_schema": {
    "language": {
      "type": "select",
      "label": "语言",
      "default": "zh-CN",
      "options": [
        {"value": "zh", "label": "中文"},
        {"value": "en", "label": "English"}
      ]
    },
    "poster_quality": {
      "type": "select",
      "label": "海报质量",
      "default": "high",
      "options": [
        {"value": "low", "label": "低"},
        {"value": "medium", "label": "中"},
        {"value": "high", "label": "高"}
      ]
    },
    "download_screenshots": {
      "type": "boolean",
      "label": "下载截图",
      "default": true
    },
    "screenshot_count": {
      "type": "number",
      "label": "截图数量",
      "default": 3,
      "min": 1,
      "max": 10
    }
  },
  "runtime_requirements": {
    "max_execution_time_seconds": 300,
    "min_memory_mb": 128
  },
  "entry_point": "bin/scraper",
  "supported_identifiers": ["num", "filename"]
}
```

### 2.5 插件打包格式

支持的打包格式：
- `.tar.gz` - Linux/macOS通用格式
- `.zip` - Windows通用格式

打包内容：
- plugin.json（必需）
- bin/ 目录及可执行文件（必需）
- 可选的README.md、icon.png等资源

## 三、数据库表结构设计

### 3.1 SQLite表结构

```sql
-- 插件表
CREATE TABLE plugins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plugin_id VARCHAR(50) NOT NULL,                   -- 插件ID（对应plugin.json中的id）
    version VARCHAR(20) NOT NULL,                      -- 版本号
    name VARCHAR(100) NOT NULL,                       -- 插件名称
    description TEXT,                                  -- 描述
    author VARCHAR(100),                              -- 作者
    homepage VARCHAR(255),                             -- 主页URL
    entry_point VARCHAR(100) DEFAULT 'bin/scraper',  -- 入口执行文件路径
    supported_media_types VARCHAR(100) DEFAULT 'movie', -- 支持的媒体类型（逗号分隔）
    supported_languages VARCHAR(200) DEFAULT 'zh-CN',  -- 支持的语言（逗号分隔）
    plugin_dir VARCHAR(255) NOT NULL,                 -- 插件目录路径（绝对路径）
    is_enabled BOOLEAN DEFAULT 1,                      -- 是否启用
    is_installed BOOLEAN DEFAULT 1,                    -- 是否已安装
    config_schema TEXT,                               -- 配置schema（JSON字符串）
    runtime_requirements TEXT,                          -- 运行要求（JSON字符串）
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, version)
);

-- 插件配置表（每个插件的实例配置）
CREATE TABLE plugin_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plugin_id VARCHAR(50) NOT NULL,                  -- 关联插件ID
    plugin_version VARCHAR(20),                       -- 插件版本（可选，空表示使用最新版本）
    library_id INTEGER,                               -- 关联的媒体库ID（可选，为空表示全局配置）
    config_name VARCHAR(100) DEFAULT 'default',      -- 配置名称
    config_data TEXT NOT NULL,                        -- 配置数据（JSON字符串）
    is_active BOOLEAN DEFAULT 0,                      -- 是否为活动配置
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, library_id, config_name)
);

-- 插件执行日志表
CREATE TABLE plugin_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plugin_id VARCHAR(50) NOT NULL,                  -- 执行的插件ID
    plugin_version VARCHAR(20),                       -- 插件版本
    media_library_id INTEGER,                         -- 媒体库ID
    media_id INTEGER,                                 -- 媒体项目ID
    execution_type VARCHAR(50) NOT NULL,             -- 执行类型: 'manual', 'auto', 'batch'
    source_dir VARCHAR(500),                          -- 源目录路径
    status VARCHAR(20) NOT NULL,                     -- 状态: pending, running, success, failed, timeout
    error_message TEXT,                               -- 错误信息
    progress_percent INTEGER DEFAULT 0,                -- 进度百分比
    current_step VARCHAR(50),                         -- 当前步骤
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    duration_seconds INTEGER,                          -- 执行时长
    metadata_output TEXT,                             -- 输出的元数据（JSON字符串）
    created_files TEXT,                               -- 创建的文件列表（JSON字符串）
    statistics TEXT                                  -- 统计信息（JSON字符串）
);

-- 索引
CREATE INDEX idx_plugins_plugin_id ON plugins(plugin_id);
CREATE INDEX idx_plugin_configs_plugin_id ON plugin_configs(plugin_id);
CREATE INDEX idx_plugin_configs_library_id ON plugin_configs(library_id);
CREATE INDEX idx_plugin_execution_logs_plugin_id ON plugin_execution_logs(plugin_id);
CREATE INDEX idx_plugin_execution_logs_media_id ON plugin_execution_logs(media_id);
CREATE INDEX idx_plugin_execution_logs_status ON plugin_execution_logs(status);
CREATE INDEX idx_plugin_execution_logs_start_time ON plugin_execution_logs(start_time);
```

## 四、API接口设计

### 4.1 插件管理接口

#### 获取所有插件
```
GET /api/plugins
Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "av-mogu",
      "name": "AVMOGU搜刮器",
      "version": "1.0.0",
      "description": "从AVMOGU网站获取成人电影元数据",
      "author": "MediaHouse",
      "is_enabled": true,
      "is_installed": true,
      "supported_media_types": ["movie"],
      "config_schema": {...},
      "runtime_requirements": {...},
      "create_time": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### 获取单个插件详情
```
GET /api/plugins/{pluginId}
Response: 200 OK
{
  "success": true,
  "data": {
    "id": "av-mogu",
    "name": "AVMOGU搜刮器",
    "version": "1.0.0",
    "description": "从AVMOGU网站获取成人电影元数据",
    "author": "MediaHouse",
    "homepage": "https://...",
    "is_enabled": true,
    "is_installed": true,
    "supported_media_types": ["movie"],
    "supported_languages": ["zh-CN", "en-US"],
    "config_schema": {...},
    "runtime_requirements": {...},
    "plugin_dir": "/path/to/plugins/av-mogu/1.0.0",
    "entry_point": "bin/scraper"
  }
}
```

#### 安装插件
```
POST /api/plugins/install
Request: multipart/form-data
- file: plugin.tar.gz 或 plugin.zip

Response: 200 OK
{
  "success": true,
  "message": "Plugin installed successfully",
  "data": {
    "plugin_id": "av-mogu",
    "version": "1.0.0",
    "plugin_dir": "/path/to/plugins/av-mogu/1.0.0"
  }
}
```

#### 更新插件状态
```
PUT /api/plugins/{pluginId}
Request:
{
  "is_enabled": false
}

Response: 200 OK
{
  "success": true,
  "message": "Plugin updated"
}
```

#### 卸载插件
```
DELETE /api/plugins/{pluginId}?version={version}
Response: 200 OK
{
  "success": true,
  "message": "Plugin uninstalled"
}
```

### 4.2 插件配置接口

#### 获取插件配置
```
GET /api/plugins/{pluginId}/configs?libraryId={libraryId}
Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": 1,
      "plugin_id": "av-mogu",
      "plugin_version": "1.0.0",
      "library_id": 1,
      "config_name": "default",
      "is_active": true,
      "config_data": {
        "language": "zh-CN",
        "poster_quality": "high"
      }
    }
  ]
}
```

#### 创建/更新插件配置
```
POST /api/plugins/{pluginId}/configs
Request:
{
  "plugin_version": "1.0.0",
  "library_id": 1,
  "config_name": "default",
  "config_data": {
    "language": "zh-CN",
    "poster_quality": "high",
    "download_screenshots": true
  },
  "is_active": true
}

Response: 200 OK
{
  "success": true,
  "message": "Configuration saved",
  "data": {
    "id": 1
  }
}
```

#### 删除插件配置
```
DELETE /api/plugins/{pluginId}/configs/{configId}
Response: 200 OK
{
  "success": true,
  "message": "Configuration deleted"
}
```

### 4.3 插件执行接口

#### 执行插件搜刮单个媒体目录
```
POST /api/plugins/{pluginId}/execute
Request:
{
  "plugin_version": "1.0.0",
  "source_dir": "/path/to/movie",
  "config_name": "default",
  "media_info": {
    "title": "电影标题",
    "year": "2024"
  }
}

Response: 202 Accepted
{
  "success": true,
  "message": "Plugin execution started",
  "data": {
    "execution_id": 123,
    "status": "running"
  }
}
```

#### 批量执行插件
```
POST /api/plugins/{pluginId}/execute-batch
Request:
{
  "plugin_version": "1.0.0",
  "library_id": 1,
  "media_ids": [1, 2, 3],
  "config_name": "default"
}

Response: 202 Accepted
{
  "success": true,
  "message": "Batch execution started",
  "data": {
    "total": 3,
    "execution_ids": [123, 124, 125]
  }
}
```

#### 获取执行状态
```
GET /api/plugins/execution/{executionId}
Response: 200 OK
{
  "success": true,
  "data": {
    "id": 123,
    "plugin_id": "av-mogu",
    "plugin_version": "1.0.0",
    "status": "running",
    "progress_percent": 50,
    "current_step": "downloading",
    "start_time": "2024-01-01T00:00:00Z",
    "duration_seconds": 30
  }
}
```

#### 获取执行日志列表
```
GET /api/plugins/{pluginId}/logs?mediaId={mediaId}&limit=10
Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": 123,
      "plugin_version": "1.0.0",
      "status": "success",
      "progress_percent": 100,
      "start_time": "2024-01-01T00:00:00Z",
      "end_time": "2024-01-01T00:01:00Z",
      "duration_seconds": 60,
      "metadata_output": {...}
    }
  ]
}
```

#### 取消执行
```
DELETE /api/plugins/execution/{executionId}
Response: 200 OK
{
  "success": true,
  "message": "Execution cancelled"
}
```

## 五、核心类设计

### 5.1 实体类

- `Plugin` - 插件信息
- `PluginConfig` - 插件配置
- `PluginExecutionLog` - 执行日志

### 5.2 Service类

- `IPluginService` / `PluginService` - 插件CRUD操作
- `IPluginConfigService` / `PluginConfigService` - 配置管理
- `IPluginExecutionService` / `PluginExecutionService` - 插件执行管理

### 5.3 辅助类

- `PluginRunner` - 负责运行打包好的插件可执行文件
- `PluginInstaller` - 负责插件安装/卸载（解压、验证）
- `PluginConfigSchema` - 配置schema定义和验证

## 六、技术实现要点

1. **插件执行**: 直接运行插件打包目录中的可执行文件（bin/scraper 或 bin/scraper.exe）
2. **跨平台支持**: 根据操作系统自动选择正确的可执行文件
3. **异步执行**: 插件执行在后台任务中运行，不阻塞API响应
4. **进度跟踪**: 解析stderr中的JSON行，实时更新数据库中的进度
5. **超时控制**: 根据plugin.json中的max_execution_time_seconds设置超时
6. **配置验证**: 使用配置schema验证用户输入的配置值
7. **多版本支持**: 支持同一插件的不同版本并存，配置时指定版本

## 七、安全考虑

1. 插件可执行文件只允许在指定目录执行
2. 限制插件执行的文件系统访问范围（仅允许访问source_dir及其子目录）
3. 对插件上传进行格式验证和完整性检查
4. 记录所有插件执行日志用于审计
5. 限制并发执行数量，防止资源耗尽
6. 插件目录权限隔离，防止插件访问系统敏感文件

## 八、插件打包规范（供插件开发者参考）

### 8.1 目录结构

```
my-scraper-1.0.0/
├── plugin.json          # 插件定义（必需）
├── bin/                 # 可执行文件目录（必需）
│   ├── scraper          # Linux/macOS可执行文件
│   └── scraper.exe      # Windows可执行文件
└── README.md            # 说明文档（可选）
```

### 8.2 plugin.json 示例

```json
{
  "id": "my-scraper",
  "name": "我的搜刮器",
  "version": "1.0.0",
  "description": "从某个数据源获取媒体元数据",
  "author": "Your Name",
  "homepage": "https://github.com/yourname/my-scraper",
  "supported_media_types": ["movie"],
  "supported_languages": ["zh-CN"],
  "config_schema": {
    "language": {
      "type": "select",
      "label": "语言",
      "default": "zh-CN",
      "options": [
        {"value": "zh-CN", "label": "中文"}
      ]
    }
  },
  "runtime_requirements": {
    "max_execution_time_seconds": 300
  },
  "entry_point": "bin/scraper",
  "supported_identifiers": ["num"]
}
```

### 8.3 可执行文件行为规范

- 从stdin读取JSON格式的输入
- 向stdout输出JSON格式的结果
- 向stderr输出进度信息（JSON行格式）
- 确保返回值：成功返回0，失败返回非零
- 支持信号处理，收到SIGTERM时优雅退出

## 九、插件运行命令规范

### 9.1 基本命令结构

插件通过标准输入/输出进行通信，运行方式为：

**Linux/macOS:**
```bash
/path/to/plugins/{pluginId}/{version}/bin/scraper < input.json
```

**Windows:**
```cmd
path\to\plugins\{pluginId}\{version}\bin\scraper.exe < input.json
```

### 9.2 完整执行流程

```bash
# 1. 准备输入JSON（通过文件重定向到stdin）
cat > input.json << EOF
{
  "action": "scrape",
  "source_dir": "/path/to/movie/directory",
  "output_dir": "/path/to/output/directory"
  "config": {
    "language": "zh-CN",
    "poster_quality": "high"
  },
  "media_info": {
    "title": "电影标题",
    "year": "2024"
  }
}
EOF

# 2. 运行插件，同时捕获stdout和stderr
/path/to/plugins/av-mogu/1.0.0/bin/scraper < input.json > output.json 2> progress.log

# 3. 检查退出码
exit_code=$?
if [ $exit_code -eq 0 ]; then
    echo "执行成功"
    # 解析output.json获取元数据
else
    echo "执行失败，退出码: $exit_code"
fi
```

### 9.3 进度通知（stderr）

插件通过stderr输出进度通知，每行一个JSON对象：

```json
{"type": "progress", "step": "searching", "message": "Searching for movie...", "percent": 10}
{"type": "progress", "step": "downloading", "message": "Downloading poster...", "percent": 50}
{"type": "progress", "step": "saving", "message": "Saving metadata...", "percent": 80}
```

### 9.4 输出结果（stdout）

执行成功时，向stdout输出JSON：

```json
{
  "status": "success",
  "message": "Scraping completed",
  "metadata": {
    "title": "电影标题",
    "original_title": "原始标题",
    "year": "2024",
    "summary": "剧情简介"
  },
  "created_files": {
    "nfo": "movie.nfo",
    "poster": "poster.jpg"
  },
  "statistics": {
    "total_time_ms": 5000,
    "api_requests": 3
  }
}
```

### 9.5 退出码规则

| 退出码 | 含义 |
|--------|------|
| 0 | 执行成功 |
| 非零 | 执行失败 |

### 9.6 插件开发者实现示例（Python）

```python
#!/usr/bin/env python3
import sys
import json

def main():
    # 1. 从stdin读取输入
    input_data = json.load(sys.stdin)

    action = input_data.get("action")
    source_dir = input_data.get("source_dir")
    config = input_data.get("config", {})

    # 2. 发送进度通知到stderr
    def send_progress(step, message, percent):
        progress = {
            "type": "progress",
            "step": step,
            "message": message,
            "percent": percent
        }
        print(json.dumps(progress), file=sys.stderr, flush=True)

    send_progress("initializing", "Starting scraper...", 0)
    send_progress("searching", "Searching...", 10)
    # ... 执行搜刮逻辑 ...

    # 3. 向stdout输出结果
    result = {
        "status": "success",
        "message": "Scraping completed",
        "metadata": { /* 元数据 */ },
        "created_files": { /* 创建的文件 */ },
        "statistics": { /* 统计信息 */ }
    }
    print(json.dumps(result), file=sys.stdout, flush=True)

    # 4. 返回0表示成功
    sys.exit(0)

if __name__ == "__main__":
    main()
```

### 9.7 设计要点

- **标准化接口**：所有插件使用相同的输入/输出格式
- **跨平台兼容**：支持Linux/macOS/Windows
- **实时进度跟踪**：通过stderr输出进度JSON
- **简洁通信**：仅使用stdin/stdout/stderr，无需复杂IPC
- **易于调试**：可以手动运行插件并查看输入/输出
