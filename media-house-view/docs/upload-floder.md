# 文件夹上传功能 - 前端对接文档

## 概述

后端已完成文件夹上传功能的实现，前端需要对接以下 API 端点。功能支持：
- 拖拽上传整个文件夹
- 保持原始目录结构
- 支持并发上传多个文件
- 分块上传大文件
- 实时进度跟踪

---

## API 端点

### 1. 创建文件夹上传任务

```http
POST /api/media/upload-tasks/folders
```

**请求体：**
```typescript
{
  folder_name: string;      // 文件夹名称
  total_files: number;      // 总文件数
  total_size: number;       // 总大小（字节）
  root_path?: string;        // 可选，文件夹根路径
}
```

**响应：**
```typescript
{
  folderId: string;
  folderName: string;
  totalFiles: number;
  completedFiles: number;
  totalSize: number;
  uploadedSize: number;
  progress: number;        // 0-1
  status: string;         // "pending" | "uploading" | "completed" | "cancelled" | "failed"
  files: FileUploadInfo[];
  createdAt: string;
  updatedAt?: string;
}
```

---

### 2. 获取所有文件夹上传任务

```http
GET /api/media/upload-tasks/folders
```

**响应：** `FolderUploadTaskDto[]`

---

### 3. 获取文件夹上传进度

```http
GET /api/media/upload-tasks/folders/{folder_id}
```

**响应：** `FolderUploadTaskDto`

---

### 4. 添加文件到文件夹

```http
POST /api/media/upload-tasks/folders/{folder_id}/files
```

**请求体：**
```typescript
{
  file_name: string;        // 文件名
  relative_path: string;    // 相对路径，如 "subfolder/file.mp4" 或 "file.mp4"
  file_size: number;       // 文件大小（字节）
  file_md5: string;       // 文件 MD5
  chunk_size?: number;      // 分块大小，默认 5MB
}
```

**响应：**
```typescript
{
  uploadId: string;         // 新创建的上传任务 ID
  fileName: string;
  fileSize: number;
  fileMd5: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunksNum: number;
  uploadedSize: number;
  maxUploadedChunkIndex: number;
  missingChunksInUploadedRange: number[];
  progress: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  isNew: boolean;          // 是否为新创建的任务
}
```

---

### 5. 上传文件分块

```http
POST /api/media/upload-tasks/{upload_id}/chunk?chunk_index={chunk_index}
```

**请求体：** 二进制数据（application/octet-stream）
**限制：** 单个分块最大 50MB

**响应：**
```typescript
{
  chunk_index: number;
  uploadedChunksNum: number;
  progress: number;
}
```

---

### 6. 合并文件

```http
POST /api/media/upload-tasks/{upload_id}/merge
```

**响应：**
```typescript
{
  success: boolean;
  error?: string;
  message?: string;
  data?: {
    mediaId: string;
    status: string;
  };
  missingChunks?: number[];
  uploadedChunksNum?: number;
}
```

---

### 7. 删除文件夹上传任务

```http
DELETE /api/media/upload-tasks/folders/{folder_id}
```

**响应：**
```typescript
{
  message: string;
}
```

---

## TypeScript 类型定义

```typescript
// 文件夹上传任务
interface FolderUploadTaskDto {
  folderId: string;
  folderName: string;
  totalFiles: number;
  completedFiles: number;
  totalSize: number;
  uploadedSize: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'cancelled' | 'failed';
  files: FileUploadInfo[];
  createdAt: string;
  updatedAt?: string;
}

// 文件上传信息
interface FileUploadInfo {
  uploadId: string;
  fileName: string;
  relativePath?: string;
  fileSize: number;
  uploadedSize: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'cancelled' | 'failed';
}

// 创建文件夹上传请求
interface CreateFolderUploadRequest {
  folder_name: string;
  total_files: number;
  total_size: number;
  root_path?: string;
}

// 添加文件到文件夹请求
interface AddFileToFolderRequest {
  file_name: string;
  relative_path: string;
  file_size: number;
  file_md5: string;
  chunk_size?: number;
}

// 上传任务（单文件）
interface UploadTaskDto {
  uploadId: string;
  fileName: string;
  fileSize: number;
  fileMd5: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunksNum: number;
  uploadedSize: number;
  maxUploadedChunkIndex: number;
  missingChunksInUploadedRange: number[];
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  updatedAt?: string;
  isNew: boolean;
}

// 合并响应
interface MergeResponse {
  success: boolean;
  error?: string;
  message?: string;
  data?: {
    mediaId: string;
    status: string;
  };
  missingChunks?: number[];
  uploadedChunksNum?: number;
}
```

---

## 完整上传流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      文件夹上传流程                                  │
└─────────────────────────────────────────────────────────────────────────┘

[1] 用户拖拽文件夹
       │
       ▼
[2] 扫描文件夹，计算总文件数和总大小
       │
       ▼
[3] POST /api/media/upload-tasks/folders
    请求: { folder_name, total_files, total_size }
    响应: { folderId, ... }
       │
       ▼
[4] 为每个文件创建上传任务
    for each file:
        POST /api/media/upload-tasks/folders/{folderId}/files
        请求: { file_name, relative_path, file_size, file_md5 }
        响应: { uploadId, ... }
       │
       ▼
[5] 并发上传各文件分块
    for each file (concurrently):
        for each chunk:
            POST /api/media/upload-tasks/{uploadId}/chunk?chunk_index=N
            请求: chunk data (binary)
            响应: { chunk_index, uploadedChunksNum, progress }
       │
       ▼
[6] 合并每个文件
    for each file:
        POST /api/media/upload-tasks/{uploadId}/merge
        响应: { success, data: { mediaId } }
       │
       ▼
[7] 所有文件完成后
    folder.status = "completed"
    文件已暂存到 staging/folders/{folderId}/ (保持目录结构)
```

---

## 前端实现示例

### 1. 文件 MD5 计算工具

```typescript
async function calculateFileMD5(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
```

### 2. 扫描文件夹

```typescript
interface FileInfo {
  file: File;
  relativePath: string;
  size: number;
}

async function scanFolder(fileList: File[]): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  for (const item of fileList) {
    if (item.kind === 'file') {
      const file = await getFileFromEntry(item);
      // webkitRelativePath 保存原始目录结构
      const relativePath = (item as any).webkitRelativePath || file.name;
      files.push({
        file,
        relativePath,
        size: file.size
      });
    }
  }

  return files;
}

async function getFileFromEntry(entry: FileSystemEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file(resolve, reject);
    } else {
      reject(new Error('Not a file'));
    }
  });
}
```

### 3. 上传文件夹流程

```typescript
class FolderUploader {
  private folderId: string | null = null;
  private fileTasks: Map<string, UploadTaskDto> = new Map();
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

  async uploadFolder(fileList: File[]) {
    // 1. 扫描文件夹
    const files = await this.scanFolder(fileList);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const folderName = files[0]?.relativePath.split('/')[0] || 'Uploaded Folder';

    // 2. 创建文件夹上传任务
    const folderResponse = await fetch('/api/media/upload-tasks/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_name: folderName,
        total_files: files.length,
        total_size: totalSize
      })
    });

    this.folderId = (await folderResponse.json()).folderId;

    // 3. 为每个文件创建上传任务
    for (const fileInfo of files) {
      const md5 = await this.calculateFileMD5(fileInfo.file);
      const response = await fetch(`/api/media/upload-tasks/folders/${this.folderId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: fileInfo.file.name,
          relative_path: fileInfo.relativePath,
          file_size: fileInfo.file.size,
          file_md5: md5,
          chunk_size: this.CHUNK_SIZE
        })
      });

      const task = await response.json();
      this.fileTasks.set(task.uploadId, { ...task, file: fileInfo.file });
    }

    // 4. 并发上传各文件
    await this.uploadFiles();

    return this.folderId;
  }

  private async uploadFiles() {
    const tasks = Array.from(this.fileTasks.values());
    await Promise.all(tasks.map(task => this.uploadFile(task)));
  }

  private async uploadFile(task: UploadTaskDto & { file: File }) {
    const totalChunks = task.totalChunks;
    const chunkSize = task.chunkSize;

    // 上传每个分块
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, task.fileSize);
      const chunk = task.file.slice(start, end);

      await fetch(`/api/media/upload-tasks/${task.uploadId}/chunk?chunk_index=${i}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunk
      });
    }

    // 合并文件
    await fetch(`/api/media/upload-tasks/${task.uploadId}/merge`, {
      method: 'POST'
    });
  }

  private async calculateFileMD5(file: File): Promise<string> {
    // ... MD5 计算实现
    return '';
  }

  private async scanFolder(fileList: File[]): Promise<FileInfo[]> {
    // ... 文件夹扫描实现
    return [];
  }
}
```

### 4. 拖拽上传组件

```typescript
function FolderUploadComponent() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items);

    if (items.length > 0 && items[0].webkitGetAsEntry) {
      setUploading(true);

      const uploader = new FolderUploader();
      const folderId = await uploader.uploadFolder(items as any);

      // 轮询获取上传进度
      const interval = setInterval(async () => {
        const response = await fetch(`/api/media/upload-tasks/folders/${folderId}`);
        const data = await response.json();
        setProgress(data.progress * 100);

        if (data.status === 'completed') {
          clearInterval(interval);
          setUploading(false);
        }
      }, 1000);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{ border: '2px dashed #ccc', padding: '50px', textAlign: 'center' }}
    >
      {uploading ? (
        <div>上传中... {progress.toFixed(1)}%</div>
      ) : (
        <div>拖拽文件夹到此处上传</div>
      )}
    </div>
  );
}
```

---

## 注意事项

1. **并发控制**
   - 每个文件可独立上传，支持并发
   - 建议前端控制并发上传的文件数量（如 3-5 个）
   - 单个文件的分片应按顺序上传

2. **MD5 计算**
   - 大文件 MD5 计算可能较慢，建议在用户选择文件后后台计算
   - 可考虑使用 Web Worker 避免阻塞 UI

3. **进度跟踪**
   - 每个文件有独立的进度（0-1）
   - 文件夹整体进度 = 所有文件已上传大小 / 总大小
   - 建议使用轮询或 WebSocket 实时更新进度

4. **错误处理**
   - 分块上传失败可重试
   - 合并失败可重新上传对应分块
   - 支持断点续传（已上传的分片无需重新上传）

5. **相对路径**
   - 使用 `webkitRelativePath` 保存原始目录结构
   - 格式如：`subfolder/file.mp4` 或直接 `file.mp4`
   - 暂存时会自动还原此目录结构

---

## 已有单文件上传 API（参考）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/media/upload-tasks` | POST | 创建单文件上传任务 |
| `/api/media/upload-tasks` | GET | 获取所有上传任务 |
| `/api/media/upload-tasks/{id}` | GET | 获取上传任务详情 |
| `/api/media/upload-tasks/{id}/chunk` | POST | 上传分块 |
| `/api/media/upload-tasks/{id}/merge` | POST | 合并文件 |
| `/api/media/upload-tasks/{id}` | DELETE | 删除上传任务 |
