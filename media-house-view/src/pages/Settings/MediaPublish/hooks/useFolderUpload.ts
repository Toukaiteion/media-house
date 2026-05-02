import { useState, useCallback, useRef } from 'react';
import type { FolderUploadTask, FileUploadInfo, UploadStatus } from '../../../../types';
import { api } from '../../../../services/api';
import { CHUNK_SIZE, CONCURRENCY, uploadChunkWithRetry, calculateFileMd5 } from '../constants';

interface FileNode {
  file: File;
  relativePath: string;
}

interface UploadFileTask {
  uploadId: string;
  file: File;
  md5: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
  abortController?: AbortController;
}

export function useFolderUpload() {
  const [folderTasks, setFolderTasks] = useState<FolderUploadTask[]>([]);
  const [uploadSpeeds, setUploadSpeeds] = useState<Map<string, number>>(new Map());

  // 存储每个文件夹上传的文件任务
  const fileTaskMap = useRef<Map<string, Map<string, UploadFileTask>>>(new Map());

  // 上传单个文件
  const uploadSingleFile = useCallback(async (
    folderId: string,
    task: UploadFileTask,
    onUpdate?: (uploadId: string, uploadedSize: number, progress: number) => void
  ): Promise<void> => {
    const { uploadId, file } = task;
    const totalChunks = task.totalChunks;
    const chunkQueue = Array.from({ length: totalChunks }, (_, i) => i);
    const uploadedChunks = new Set<number>();

    const abortController = new AbortController();
    task.abortController = abortController;

    const startTime = Date.now();
    let lastUpdateTime = 0;
    let actualUploadedSize = 0;

    // 更新速度和进度的定时器
    const updateInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastUpdateTime < 300) return;
      lastUpdateTime = now;

      const progress = file.size > 0 ? actualUploadedSize / file.size : 0;
      onUpdate?.(uploadId, actualUploadedSize, progress);

      const elapsed = (now - startTime) / 1000;
      const speed = elapsed > 0 ? actualUploadedSize / elapsed : 0;
      setUploadSpeeds(prev => new Map(prev).set(folderId, speed));
    }, 500);

    try {
      // 并发上传分片
      const workers: Promise<void>[] = [];
      const workerCount = Math.min(CONCURRENCY, chunkQueue.length);

      const runWorker = async () => {
        while (chunkQueue.length > 0) {
          const chunkIndex = chunkQueue.shift();
          if (chunkIndex !== undefined) {
            await uploadChunkWithRetry(
              uploadId,
              file,
              chunkIndex,
              () => {
                uploadedChunks.add(chunkIndex);
                // 计算这个 chunk 的实际大小
                const chunkStart = chunkIndex * CHUNK_SIZE;
                const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, file.size);
                const chunkSize = chunkEnd - chunkStart;
                actualUploadedSize += chunkSize;
              },
              3,
              abortController.signal
            );
          }
        }
      };

      for (let i = 0; i < workerCount; i++) {
        workers.push(runWorker());
      }

      await Promise.all(workers);

      const progress = file.size > 0 ? actualUploadedSize / file.size : 0;
      onUpdate?.(uploadId, actualUploadedSize, progress);

      // 合并文件
      await api.mergeUpload({ upload_id: uploadId });
    } finally {
      clearInterval(updateInterval);
    }
  }, []);

  // 开始文件夹上传
  const startFolderUpload = useCallback(async (
    files: FileNode[],
    onMessage?: (type: 'success' | 'error', text: string) => void
  ): Promise<string | null> => {
    try {
      // 1. 验证文件列表
      if (files.length === 0) {
        onMessage?.('error', '未找到可上传的文件');
        return null;
      }

      const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
      const folderName = files[0]?.relativePath.split('/')[0] || 'Uploaded Folder';

      // 2. 创建文件夹上传任务
      const folderTask = await api.createFolderUploadTask({
        folder_name: folderName,
        total_files: files.length,
        total_size: totalSize,
      });

      setFolderTasks(prev => [...prev, folderTask]);
      onMessage?.('success', `已创建文件夹上传任务: ${folderName}`);

      // 3. 为每个文件创建上传任务
      const fileTasksMap = new Map<string, UploadFileTask>();

      for (const fileNode of files) {
        const md5 = await calculateFileMd5(fileNode.file);
        const uploadTask = await api.addFileToFolder(folderTask.folder_id, {
          file_name: fileNode.file.name,
          relative_path: fileNode.relativePath,
          file_size: fileNode.file.size,
          file_md5: md5,
          chunk_size: CHUNK_SIZE,
        });

        const uploadFileTask: UploadFileTask = {
          uploadId: uploadTask.upload_id,
          file: fileNode.file,
          md5,
          totalChunks: uploadTask.total_chunks,
          uploadedChunks: new Set(),
        };

        fileTasksMap.set(uploadTask.upload_id, uploadFileTask);
      }

      fileTaskMap.current.set(folderTask.folder_id, fileTasksMap);

      // 构建文件信息列表并更新状态
      const fileInfos: FileUploadInfo[] = Array.from(fileTasksMap.entries()).map(([uploadId, task]) => {
        const fileNode = files.find(f => f.file === task.file);
        return {
          upload_id: uploadId,
          file_name: task.file.name,
          relative_path: fileNode?.relativePath,
          file_size: task.file.size,
          uploaded_size: 0,
          progress: 0,
          status: 'pending' as UploadStatus,
        };
      });

      setFolderTasks(prev =>
        prev.map(t =>
          t.folder_id === folderTask.folder_id
            ? { ...t, files: fileInfos }
            : t
        )
      );

      // 4. 并发上传所有文件
      const fileTaskEntries = Array.from(fileTasksMap.entries());

      await Promise.all(fileTaskEntries.map(async ([_uploadId, fileTask]) => {
        await uploadSingleFile(folderTask.folder_id, fileTask, (upload_id, uploadedSize, progress) => {
          setFolderTasks(prev =>
            prev.map(t =>{
              console.log(`Updating folder task ${t.folder_id} for file ${upload_id}: uploaded ${uploadedSize} bytes, progress ${(progress * 100).toFixed(2)}%`);
              if (t.folder_id === folderTask.folder_id) {
                let folderUploadedSize = 0;
                t.files.forEach(f => {
                  if (f.upload_id === upload_id) {
                    f.uploaded_size = uploadedSize;
                    f.progress = progress;
                  }
                  folderUploadedSize += f.uploaded_size;
                })
                t.uploaded_size = folderUploadedSize;
                t.progress = folderUploadedSize / totalSize || 0;
              }
              return t;
            })
          );
        });
      }));

      // 5. 所有文件上传完成后，调用 create-staging 生成待发布媒体
      await api.createStagingFromFolder(folderTask.folder_id);

      // 6. 更新任务状态为已完成
      setFolderTasks(prev =>
        prev.map(t =>
          t.folder_id === folderTask.folder_id
            ? { ...t, status: 'completed', completed_files: files.length }
            : t
        )
      );

      return folderTask.folder_id;
    } catch (err) {
      onMessage?.('error', err instanceof Error ? err.message : '文件夹上传失败');
      return null;
    }
  }, [uploadSingleFile]);

  // 删除文件夹上传任务
  const deleteFolderUploadTask = useCallback(async (
    folderId: string,
    onMessage?: (type: 'success' | 'error', text: string) => void
  ) => {
    try {
      // 取消所有文件的上传
      const fileTasks = fileTaskMap.current.get(folderId);
      if (fileTasks) {
        fileTasks.forEach(task => task.abortController?.abort());
      }

      await api.deleteFolderUploadTask(folderId);

      fileTaskMap.current.delete(folderId);
      setFolderTasks(prev => prev.filter(t => t.folder_id !== folderId));
      setUploadSpeeds(prev => {
        const next = new Map(prev);
        next.delete(folderId);
        return next;
      });

      onMessage?.('success', '文件夹上传任务已删除');
    } catch (err) {
      onMessage?.('error', err instanceof Error ? err.message : '删除失败');
    }
  }, []);

  return {
    folderTasks,
    uploadSpeeds,
    startFolderUpload,
    deleteFolderUploadTask,
  };
}