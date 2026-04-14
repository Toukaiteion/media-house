# 媒体上传模块设计文档

## 1. 概述

本模块提供媒体文件上传功能，支持分片传输、断点续传、进度查询等特性。上传的媒体先存储在临时区域，待元数据完善后再发布到正式媒体库。

## 2. 核心功能

- **分片上传**: 支持大文件分片上传
- **进度查询**: 实时查询上传进度
- **文件合并**: 前端上传完成后触发合并
- **上传删除**: 取消/删除上传任务
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
| file_md5 | string | 文件MD5值 |
| chunk_size | int | 分片大小（默认5MB） |
| total_chunks | int | 总分片数 |
| uploaded_chunks | int | 已上传分片数 |
| uploaded_size | long | 已上传大小（字节） |
| status | int | 状态：0=待上传，1=上传中，2=已完成，3=已取消，4=失败 |
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
  "file_name": "movie.mp4",
  "file_size": 1073741824,
  "file_md5": "d41d8cd98f00b204e9800998ecf8427e",
  "chunk_size": 5242880
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "upload_id": "uuid",
    "total_chunks": 205,
    "status": "pending"
  }
}
```

#### GET /api/upload/find-by-md5/{file_md5}
根据文件 MD5 查找未完成的上传任务

**响应（找到任务）:**
```json
{
  "success": true,
  "data": {
    "upload_id": "uuid",
    "file_name": "movie.mp4",
    "file_size": 1073741824,
    "file_md5": "d41d8cd98f00b204e9800998ecf8427e",
    "chunk_size": 5242880,
    "total_chunks": 205,
    "uploaded_chunks": 43,
    "uploaded_size": 225280000,
    "progress": 0.21,
    "status": "uploading",
    "created_at": "2026-04-15T10:00:00Z",
    "updated_at": "2026-04-15T10:05:00Z"
  }
}
```

**响应（未找到）:**
```json
{
  "success": false,
  "error": "upload_task_not_found",
  "message": "未找到匹配的上传任务"
}
```

#### POST /api/upload/chunk
上传分片

**请求表单参数:**
- `upload_id`: 上传任务ID
- `chunk_index`: 分片索引
- `chunk_data`: 二进制分片数据

**响应:**
```json
{
  "success": true,
  "data": {
    "chunk_index": 42,
    "uploaded_chunks": 43,
    "progress": 0.21
  }
}
```

#### POST /api/upload/merge
合并文件

**请求:**
```json
{
  "upload_id": "uuid"
}
```

**响应（成功）:**
```json
{
  "success": true,
  "data": {
    "media_id": "uuid",
    "status": "completed"
  }
}
```

**响应（缺失分片）:**
```json
{
  "success": false,
  "error": "missing_chunks",
  "missing_chunks": [0, 5, 12]
}
```

#### GET /api/upload/progress/{upload_id}
获取上传进度

**响应:**
```json
{
  "success": true,
  "data": {
    "upload_id": "uuid",
    "file_name": "movie.mp4",
    "file_size": 1073741824,
    "uploaded_size": 225280000,
    "total_chunks": 205,
    "uploaded_chunks": 43,
    "progress": 0.21,
    "status": "uploading"
  }
}
```

#### GET /api/upload/check-chunks/{upload_id}?index={index}
检查指定索引之前的分片是否都已上传

**响应:**
```json
{
  "success": true,
  "data": {
    "upload_id": "uuid",
    "from_index": 0,
    "to_index": 42,
    "all_uploaded": true,
    "missing_chunks": []
  }
}
```

或（存在缺失）：
```json
{
  "success": true,
  "data": {
    "upload_id": "uuid",
    "from_index": 0,
    "to_index": 42,
    "all_uploaded": false,
    "missing_chunks": [5, 12, 23]
  }
}
```

#### DELETE /api/upload/{upload_id}
取消/删除上传任务

#### GET /api/upload/list
获取所有上传任务

### 5.2 待发布媒体管理

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
      "video_path": "/staging/{id}/movie/movie.mp4",
      "status": "pending_edit",
      "created_at": "2026-04-13T10:00:00Z"
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
  "original_title": "Original Title",
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
  "library_id": 1,
  "media_name": "Movie Title (2024)"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "media_id": 123,
    "movie_id": 456,
    "status": "published"
  }
}
```

## 6. 业务流程

### 6.1 上传流程

```
1. 前端调用 /api/upload/create 创建任务（带 file_md5）
   ↓
2. 服务端生成 upload_id，创建任务记录和目录
   ↓
3. 前端分片上传文件到 /api/upload/chunk
   ↓
4. 每个分片上传后更新 progress
   ↓
5. 前端上传完成后，调用 /api/upload/merge
   ↓
6. 服务端检查所有分片是否完整
   ↓
7a. 完整：合并文件，移动到 staging 目录，创建 staging_media 记录
7b. 缺失：返回缺失的分片索引列表，前端补传后再次调用 merge
```

### 6.2 断点续传

```
1. 前端重新连接时调用 /api/upload/progress/{upload_id}
   ↓
2. 服务端返回已上传的分片数和进度
   ↓
3. 前端从未上传的分片继续上传
   ↓
4. 上传完成后调用 merge
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
  "upload_settings": {
    "chunk_size": 5242880,        // 5MB
    "max_file_size": 10737418240,  // 10GB
    "upload_path": "upload-area/uploads",
    "staging_path": "upload-area/staging",
    "temp_file_retention_days": 7,  // 临时文件保留天数
    "max_concurrent_uploads": 5,   // 最大并发上传数
    "allowed_extensions": [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv"]
  }
}
```

## 8. 前端集成要点

### 8.1 上传状态管理

**暂停时需要保存的文件信息：**
```typescript
interface UploadSession {
  upload_id: string;           // 上传任务ID
  file_name: string;           // 文件名
  file_size: number;           // 文件大小
  file_md5: string;            // 文件MD5
  chunk_size: number;          // 分片大小
  total_chunks: number;        // 总分片数
  uploaded_chunks: number;     // 已上传分片数
  file_handle?: FileSystemFileHandle; // 可选：文件系统引用（需用户授权）
  // 注意：File对象无法直接持久化，恢复时需用户重新选择文件
}
```

**恢复上传时的处理：**
1. 用户选择文件
2. 计算文件 MD5
3. 调用 `/api/upload/find-by-md5/{md5}` 查找已存在的上传任务
4. 如果找到任务，验证文件大小并询问用户是否恢复
5. 用户确认后调用 `/api/upload/check-chunks` 查询已上传的分片
6. 从缺失的分片索引继续上传

### 8.2 文件选择与任务查找

```typescript
async function handleFileSelect(file: File) {
  // 1. 计算文件 MD5
  const fileMd5 = await calculateFileMd5(file);

  // 2. 查找是否有已存在的上传任务
  const existingTask = await findUploadTaskByMd5(fileMd5);

  if (existingTask.success) {
    // 找到已存在的任务
    const task = existingTask.data;

    // 验证文件大小是否匹配
    if (task.file_size !== file.size) {
      throw new Error('文件大小不匹配');
    }

    // 询问用户是否恢复
    const shouldResume = await confirmResumeDialog(task);

    if (shouldResume) {
      // 恢复上传
      await resumeUpload(file, task.upload_id);
    }
  } else {
    // 没有找到，创建新任务
    await startNewUpload(file, fileMd5);
  }
}

async function findUploadTaskByMd5(fileMd5: string) {
  return fetch(`/api/upload/find-by-md5/${fileMd5}`)
    .then(res => res.json());
}

async function confirmResumeDialog(task: UploadTask): Promise<boolean> {
  // 显示恢复对话框
  return showConfirmDialog({
    title: '发现未完成的上传',
    message: `检测到您之前正在上传 "${task.file_name}"，已上传 ${task.progress.toFixed(1)}%。是否继续？`,
    info: {
      file_size: formatSize(task.file_size),
      uploaded_size: formatSize(task.uploaded_size),
      created_at: formatDate(task.created_at)
    }
  });
}
```

### 8.3 分片上传实现（并发上传）

```typescript
const CONCURRENCY = 3; // 并发上传数

async function startNewUpload(file: File, fileMd5: string) {
  // 1. 创建上传任务
  const task = await createUploadTask({
    file_name: file.name,
    file_size: file.size,
    file_md5: fileMd5,
    chunk_size: 5 * 1024 * 1024
  });

  // 3. 计算分片数量
  const chunkSize = 5 * 1024 * 1024; // 5MB
  const totalChunks = Math.ceil(file.size / chunkSize);

  // 4. 并发上传分片
  let uploadedCount = 0;
  const queue = Array.from({ length: totalChunks }, (_, i) => i);

  async function uploadChunkWithRetry(chunkIndex: number, retries = 3): Promise<void> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        await uploadChunk({
          upload_id: task.upload_id,
          chunk_index: chunkIndex,
          chunk_data: chunk
        });

        uploadedCount++;
        updateProgress(uploadedCount / totalChunks);
        return;
      } catch (error) {
        if (attempt === retries - 1) throw error;
        await sleep(1000 * (attempt + 1)); // 指数退避
      }
    }
  }

  // 并发上传
  const workers = [];
  for (let i = 0; i < CONCURRENCY && queue.length > 0; i++) {
    workers.push(async () => {
      while (queue.length > 0) {
        const chunkIndex = queue.shift()!;
        await uploadChunkWithRetry(chunkIndex);
      }
    });
  }

  await Promise.all(workers.map(w => w()));

  // 5. 所有分片上传完成，请求合并
  const result = await mergeUpload(task.upload_id);

  if (result.success) {
    // 合并成功，创建 staging_media
    console.log('Media ready for publishing:', result.data.media_id);
  } else if (result.error === 'missing_chunks') {
    // 有缺失的分片，重新上传
    for (const idx of result.missing_chunks) {
      await uploadChunkWithRetry(idx);
    }
    // 再次调用 merge
    await mergeUpload(task.upload_id);
  }
}
```

### 8.4 断点续传实现

```typescript
async function resumeUpload(file: File, upload_id: string) {
  // 1. 验证文件MD5
  const fileMd5 = await calculateFileMd5(file);
  const progress = await getUploadProgress(upload_id);

  if (progress.data.file_md5 !== fileMd5) {
    throw new Error('文件MD5不匹配，请选择正确的文件');
  }

  // 2. 检查已上传的分片
  const checkResult = await checkUploadedChunks(upload_id, 0);

  // 3. 上传缺失的分片
  const chunkSize = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);

  // 收集缺失的分片
  const missingChunks = checkResult.data.missing_chunks.length > 0
    ? checkResult.data.missing_chunks
    : Array.from({ length: totalChunks }, (_, i) => i)
      .filter(i => i >= checkResult.data.to_index);

  // 并发上传缺失的分片
  await uploadMissingChunks(file, upload_id, missingChunks, chunkSize);

  // 4. 上传完成后调用 merge
  await mergeUpload(upload_id);
}

async function checkUploadedChunks(upload_id: string, index: number) {
  return await fetch(`/api/upload/check-chunks/${upload_id}?index=${index}`)
    .then(res => res.json());
}

async function uploadMissingChunks(
  file: File,
  upload_id: string,
  chunkIndices: number[],
  chunkSize: number
) {
  const workers = [];
  const queue = [...chunkIndices];

  for (let i = 0; i < CONCURRENCY && queue.length > 0; i++) {
    workers.push(async () => {
      while (queue.length > 0) {
        const chunkIndex = queue.shift()!;
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        await uploadChunk({
          upload_id,
          chunk_index: chunkIndex,
          chunk_data: chunk
        });
      }
    });
  }

  await Promise.all(workers.map(w => w()));
}
```

## 9. 清理策略

- **定时清理**: 每天清理超过 `temp_file_retention_days` 的临时上传文件
- **失败重试**: 上传失败的分片保留1小时，超过时间自动标记为失败
- **发布后清理**: 成功发布后可配置是否保留 staging 区域数据

## 10. 安全考虑

- **文件类型验证**: 验证文件扩展名和MIME类型
- **大小限制**: 限制单个文件和总上传大小
- **路径遍历防护**: 防止路径遍历攻击
- **并发限制**: 限制并发上传数量防止资源耗尽
- **权限验证**: 发布操作验证用户权限
- **MD5校验**: 可选启用文件完整性校验
