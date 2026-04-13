# 媒体上传模块设计文档

## 1. 概述

本模块提供媒体文件上传功能，支持分片传输、断点续传、进度查询等特性。上传的媒体先存储在临时区域，待元数据完善后再发布到正式媒体库。

## 2. 核心功能

- **分片上传**: 支持大文件分片上传
- **断点续传**: 上传中断后可从断点处继续
- **进度查询**: 实时查询上传进度
- **上传管理**: 暂停、取消、删除上传任务
- **元数据编辑**: 编辑上传媒体的基本信息
- **发布到库**: 将完整媒体发布到指定媒体库

## 3. 架构设计

### 3.1 目录结构

```
upload-area/                    # 上传区域根目录
├── uploads/                    # 上传中的文件
│   └── {upload-id}/           # 上传任务目录
│       ├── chunks/            # 分片文件
│       │   ├── 0.chunk
│       │   ├── 1.chunk
│       │   └── ...
│       └── meta.json          # 上传元数据
└── staging/                   # 待发布媒体
    └── {media-id}/            # 待发布媒体目录
        ├── {movie-name}/       # 媒体目录
        │   ├── video.mp4       # 视频文件
        │   ├── poster.jpg      # 海报
        │   ├── fanart.jpg      # 背景图
        │   └── extrafanart/    # 截图
        │       └── ...
        └── metadata.json       # 元数据
```

### 3.2 模块分层

```
Controllers/
├── UploadController.cs          # 上传任务管理
├── UploadChunkController.cs    # 分片上传
├── StagingController.cs        # 待发布媒体管理
└── PublishController.cs         # 发布操作

Services/
├── UploadService.cs             # 上传任务业务逻辑
├── ChunkService.cs              # 分片管理
├── StagingService.cs            # 待发布媒体业务逻辑
├── PublishService.cs            # 发布业务逻辑
└── UploadMetadataService.cs    # 元数据搜刮

Interfaces/
├── IUploadService.cs
├── IChunkService.cs
├── IStagingService.cs
└── IPublishService.cs

DTOs/
├── UploadRequest.cs
├── UploadProgress.cs
├── StagingMediaDto.cs
└── PublishRequest.cs
```

## 4. 数据库设计

### 4.1 upload_tasks 表 - 上传任务

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 任务ID（UUID） |
| file_name | string | 原始文件名 |
| file_size | long | 文件总大小（字节） |
| chunk_size | int | 分片大小（默认5MB） |
| total_chunks | int | 总分片数 |
| uploaded_chunks | int | 已上传分片数 |
| uploaded_size | long | 已上传大小（字节） |
| status | int | 状态：0=待上传，1=上传中，2=已暂停，3=已完成，4=已取消，5=失败 |
| mime_type | string | 文件MIME类型 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| completed_at | datetime | 完成时间 |

### 4.2 staging_media 表 - 待发布媒体

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 媒体ID（UUID） |
| upload_task_id | string | 关联的上传任务ID |
| type | string | 媒体类型：movie, tvshow |
| title | string | 标题 |
| original_title | string | 原始标题 |
| year | int | 年份 |
| studio | string | 制片厂 |
| runtime | int | 时长（分钟） |
| description | string | 描述 |
| video_path | string | 视频文件相对路径 |
| video_size | long | 视频文件大小 |
| poster_path | string | 海报路径 |
| fanart_path | string | 背景图路径 |
| screenshots_path | string | 截图路径（逗号分隔） |
| tags | string | 标签 JSON 数组：`["标签1", "标签2"]` |
| staff | string | 演职员 JSON 数组：`[{"name":"演员","type":"actor","role":"角色"}, ...]` |
| status | int | 状态：0=待编辑，1=待发布，2=已发布 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| published_at | datetime | 发布时间 |

## 5. API 设计

### 5.1 上传任务管理

#### POST /api/upload/create
创建上传任务

**请求:**
```json
{
  "fileName": "movie.mp4",
  "fileSize": 1073741824,
  "chunkSize": 5242880
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "uploadId": "uuid",
    "totalChunks": 205,
    "status": "pending"
  }
}
```

#### POST /api/upload/chunk/{uploadId}/{chunkIndex}
上传分片

**请求:** Binary data

**响应:**
```json
{
  "success": true,
  "data": {
    "chunkIndex": 42,
    "uploadedChunks": 43,
    "progress": 0.21
  }
}
```

#### GET /api/upload/progress/{uploadId}
获取上传进度

**响应:**
```json
{
  "success": true,
  "data": {
    "uploadId": "uuid",
    "fileName": "movie.mp4",
    "fileSize": 1073741824,
    "uploadedSize": 225280000,
    "totalChunks": 205,
    "uploadedChunks": 43,
    "progress": 0.21,
    "status": "uploading"
  }
}
```

#### POST /api/upload/pause/{uploadId}
暂停上传

#### POST /api/upload/resume/{uploadId}
恢复上传

#### DELETE /api/upload/{uploadId}
取消/删除上传任务

#### GET /api/upload/list
获取所有上传任务

### 5.2 待发布媒体管理

#### POST /api/upload/complete/{uploadId}
上传完成，创建待发布媒体记录

**请求:**
```json
{
  "type": "movie",
  "title": "电影标题"
}
```

#### GET /api/staging/list
获取待发布媒体列表

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "电影标题",
      "type": "movie",
      "videoPath": "/staging/{id}/movie/movie.mp4",
      "status": "pending_edit",
      "createdAt": "2026-04-13T10:00:00Z"
    }
  ]
}
```

#### GET /api/staging/{id}
获取待发布媒体详情

#### POST /api/staging/{id}/metadata
更新媒体元数据

**请求:**
```json
{
  "title": "电影标题",
  "originalTitle": "Original Title",
  "year": 2024,
  "studio": "Studio Name",
  "runtime": 120,
  "description": "电影描述"
}
```

#### POST /api/staging/{id}/poster
上传海报

#### POST /api/staging/{id}/fanart
上传背景图

#### POST /api/staging/{id}/screenshot
上传截图

#### DELETE /api/staging/{id}
删除待发布媒体

### 5.3 发布管理

#### POST /api/staging/{id}/publish
发布媒体到指定库

**请求:**
```json
{
  "libraryId": 1,
  "mediaName": "Movie Title (2024)"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "mediaId": 123,
    "movieId": 456,
    "status": "published"
  }
}
```

## 6. 业务流程

### 6.1 上传流程

```
1. 前端调用 /api/upload/create 创建任务
   ↓
2. 服务端生成 uploadId，创建任务记录和目录
   ↓
3. 前端分片上传文件
   ↓
4. 每个分片上传后更新 progress
   ↓
5. 所有分片完成后合并文件
   ↓
6. 文件移动到 staging/{mediaId} 目录
   ↓
7. 创建 staging_media 记录
```

### 6.2 断点续传

```
1. 前端重新连接时调用 /api/upload/progress
   ↓
2. 服务端返回已上传的分片列表
   ↓
3. 前端从未上传的分片继续上传
```

### 6.3 发布流程

```
1. 用户完善元数据（标题、年份、标签等）
   ↓
2. 用户点击发布，选择目标库
   ↓
3. 调用 /api/staging/{id}/publish
   ↓
4. 创建 Media 和 Movie 记录
   ↓
5. 创建 MediaFile 记录
   ↓
6. 创建 MediaImgs 记录
   ↓
7. 创建 Tag 和 Staff 关联
   ↓
8. 更新 staging_media 状态为已发布
```

## 7. 配置参数

```json
{
  "UploadSettings": {
    "ChunkSize": 5242880,        // 5MB
    "MaxFileSize": 10737418240,  // 10GB
    "UploadPath": "upload-area/uploads",
    "StagingPath": "upload-area/staging",
    "TempFileRetentionDays": 7,  // 临时文件保留天数
    "MaxConcurrentUploads": 5,   // 最大并发上传数
    "AllowedExtensions": [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv"]
  }
}
```

## 8. 前端集成要点

### 8.1 分片上传实现

```typescript
async function uploadFile(file: File) {
  // 1. 创建上传任务
  const task = await createUploadTask(file);

  // 2. 计算分片数量
  const chunkSize = 5 * 1024 * 1024; // 5MB
  const totalChunks = Math.ceil(file.size / chunkSize);

  // 3. 上传分片
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    await uploadChunk(task.uploadId, i, chunk);

    // 更新进度
    const progress = await getUploadProgress(task.uploadId);
    updateUI(progress);
  }
}
```

### 8.2 断点续传实现

```typescript
async function resumeUpload(uploadId: string) {
  // 获取当前进度
  const progress = await getUploadProgress(uploadId);

  // 从已上传的分片数继续
  for (let i = progress.uploadedChunks; i < progress.totalChunks; i++) {
    // ... 上传分片
  }
}
```

## 9. 清理策略

- **定时清理**: 每天清理超过 `TempFileRetentionDays` 的临时上传文件
- **失败重试**: 上传失败的分片保留1小时，超过时间自动标记为失败
- **发布后清理**: 成功发布后可配置是否保留 staging 区域数据

## 10. 安全考虑

- **文件类型验证**: 验证文件扩展名和MIME类型
- **大小限制**: 限制单个文件和总上传大小
- **路径遍历防护**: 防止路径遍历攻击
- **并发限制**: 限制并发上传数量防止资源耗尽
- **权限验证**: 发布操作验证用户权限
