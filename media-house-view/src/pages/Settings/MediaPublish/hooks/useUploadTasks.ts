import { useState, useCallback } from 'react';
import type { UploadTask } from '../../../../types';
import { api } from '../../../../services/api';
import { CHUNK_SIZE, CONCURRENCY, uploadChunkWithRetry } from '../constants';

interface UploadTaskFile {
  file: File;
  type: 'movie' | 'tvshow';
  title: string;
}

export function useUploadTasks() {
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);

  // 存储上传任务的文件引用（用于恢复时获取原文件）
  const [uploadTaskFiles, setUploadTaskFiles] = useState<Map<string, UploadTaskFile>>(new Map());

  // 存储上传任务的 AbortController（用于取消上传）
  const [uploadControllers, setUploadControllers] = useState<Map<string, AbortController>>(new Map());

  // 上传速度状态
  const [uploadSpeeds, setUploadSpeeds] = useState<Map<string, number>>(new Map());

  // 执行合并（处理缺失分片）
  const performMerge = useCallback(async (
    uploadId: string,
    type: 'movie' | 'tvshow',
    title: string,
    onMessage?: (type: 'success' | 'error', text: string) => void,
    onRefreshStagingMedias?: () => void
  ) => {
    try {
      const result = await api.mergeUpload({
        upload_id: uploadId,
        type,
        title: title || undefined,
      });

      if (result.success) {
        onMessage?.('success', '上传完成');
        setUploadTasks(prev => prev.map(task => task.upload_id === uploadId ? { ...task, status: 'completed' } : task));
        onRefreshStagingMedias?.();
      } else if (result.error === 'missing_chunks') {
        // 有缺失的分片，重新上传
        const fileRef = uploadTaskFiles.get(uploadId);
        if (!fileRef) {
          onMessage?.('error', '无法找到对应的文件，请重新选择文件');
          return;
        }

        await uploadMissingChunks(uploadId, fileRef.file, result.missing_chunks, result.uploaded_chunks_num);

        // 再次尝试合并
        await performMerge(uploadId, type, title, onMessage, onRefreshStagingMedias);
      }
    } catch (err) {
      setUploadTasks(prev => prev.map(task => task.upload_id === uploadId ? { ...task, status: 'failed' } : task));
      onMessage?.('error', err instanceof Error ? err.message : '完成上传失败');
    }
  }, [uploadTaskFiles]);

  // 上传缺失的分片
  const uploadMissingChunks = useCallback(async (
    uploadId: string,
    file: File,
    missingChunks: number[],
    uploadChunksNum: number
  ) => {
    const chunkQueue = [...missingChunks];
    const uploadedChunkIndices = new Set<number>();
    let lastUpdateTime = 0;

    const workers: Promise<void>[] = [];
    const workerCount = Math.min(CONCURRENCY, chunkQueue.length);

    const runWorker = async () => {
      while (chunkQueue.length > 0) {
        const chunkIndex = chunkQueue.shift();
        if (chunkIndex !== undefined) {
          await uploadChunkWithRetry(uploadId, file, chunkIndex, () => {
            uploadedChunkIndices.add(chunkIndex);
          });
        }
      }
    };

    for (let i = 0; i < workerCount; i++) {
      workers.push(runWorker());
    }

    // 定期更新 UI
    const updateInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastUpdateTime < 300) return;
      lastUpdateTime = now;

      const currentUploaded = uploadChunksNum + uploadedChunkIndices.size;
      if (currentUploaded > 0) {
        const uploadedSize = Math.min(currentUploaded * CHUNK_SIZE, file.size);
        setUploadTasks(prev =>
          prev.map(t =>
            t.upload_id === uploadId
              ? { ...t, uploaded_chunks_num: currentUploaded, uploaded_size: uploadedSize, status: 'uploading' }
              : t
          )
        );
      }
    }, 500);

    try {
      await Promise.all(workers);
    } finally {
      if (updateInterval) clearInterval(updateInterval);
    }
  }, []);

  // 执行分片上传
  const performUpload = useCallback(async (
    task: UploadTask,
    file: File,
    type: 'movie' | 'tvshow',
    title: string,
    onMessage?: (type: 'success' | 'error', text: string) => void,
    onRefreshStagingMedias?: () => void
  ) => {
    const uploadId = task.upload_id;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 创建 AbortController
    const controller = new AbortController();
    setUploadControllers(prev => new Map(prev).set(uploadId, controller));

    // 构造chunk数组
    const init_list = task.missing_chunks_in_uploaded_range || [];
    const start_index = (task.max_uploaded_chunk_index + 1) || 0;
    const end_index = totalChunks - 1;
    const range = Array.from({ length: end_index - start_index + 1 }, (_, i) => start_index + i);
    const chunkQueue = [...new Set([...init_list, ...range])];

    const startUploadedCount = task.uploaded_chunks_num || 0;
    const uploadedChunkIndices = new Set<number>();
    let lastUpdateTime = 0;

    // 速度计算
    const startTime = Date.now();
    const startBytes = task.uploaded_size || 0;
    let updateInterval = null;

    // 定期更新 UI 和速度
    updateInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastUpdateTime < 300) return;
      lastUpdateTime = now;

      const currentUploaded = startUploadedCount + uploadedChunkIndices.size;
      if (currentUploaded > 0) {
        const uploadedSize = Math.min(currentUploaded * CHUNK_SIZE, file.size);
        setUploadTasks(prev =>
          prev.map(t =>
            t.upload_id === uploadId
              ? { ...t, uploaded_chunks_num: currentUploaded, uploaded_size: uploadedSize }
              : t
          )
        );

        const elapsed = (now - startTime) / 1000;
        const speed = elapsed > 0 ? (uploadedSize - startBytes) / elapsed : 0;
        setUploadSpeeds(prev => new Map(prev).set(uploadId, speed));
      }
    }, 500);

    // 并发上传
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(CONCURRENCY, chunkQueue.length);

    const runWorker = async () => {
      while (chunkQueue.length > 0) {
        const chunkIndex = chunkQueue.shift();
        if (chunkIndex !== undefined) {
          await uploadChunkWithRetry(uploadId, file, chunkIndex, () => {
            uploadedChunkIndices.add(chunkIndex);
          }, undefined, controller.signal);
        }
      }
    };

    for (let i = 0; i < workerCount; i++) {
      workers.push(runWorker());
    }

    setUploadTasks(prev =>
      prev.map(t =>
        t.upload_id === uploadId
          ? { ...t, status: 'uploading' }
          : t
      )
    );

    try {
      await Promise.all(workers);
      // 清理 AbortController
      setUploadControllers(prev => {
        const next = new Map(prev);
        next.delete(uploadId);
        return next;
      });
      // 清理速度
      setUploadSpeeds(prev => {
        const next = new Map(prev);
        next.delete(uploadId);
        return next;
      });
    } catch (err) {
      if (updateInterval) clearInterval(updateInterval);
      setUploadControllers(prev => {
        const next = new Map(prev);
        next.delete(uploadId);
        return next;
      });
      setUploadSpeeds(prev => {
        const next = new Map(prev);
        next.delete(uploadId);
        return next;
      });

      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      console.error('上传失败:', err);
      onMessage?.('error', `上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
      return;
    }

    await performMerge(uploadId, type, title, onMessage, onRefreshStagingMedias);
    if (updateInterval) clearInterval(updateInterval);
  }, [performMerge]);

  // 暂停上传
  const handlePauseUpload = useCallback(async (taskId: string) => {
    try {
      const controller = uploadControllers.get(taskId);
      if (controller) {
        controller.abort();
        setUploadControllers(prev => {
          const next = new Map(prev);
          next.delete(taskId);
          return next;
        });
      }

      setUploadTasks(prev =>
        prev.map(task =>
          task.upload_id === taskId
            ? { ...task, status: 'paused' }
            : task
        )
      );

      setUploadSpeeds(prev => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });
    } catch (err) {
      console.error('暂停上传失败:', err);
    }
  }, [uploadControllers]);

  // 恢复上传
  const handleResumeUpload = useCallback(async (taskId: string, onMessage?: (type: 'success' | 'error', text: string) => void) => {
    try {
      setUploadTasks(prev =>
        prev.map(task =>
          task.upload_id === taskId
            ? { ...task, status: 'uploading' }
            : task
        )
      );

      const task = await api.getUploadTask(taskId);
      const taskFile = uploadTaskFiles.get(taskId);
      if (!taskFile) {
        onMessage?.('error', '无法找到对应的文件，请重新上传');
        setUploadTasks(prev =>
          prev.map(t =>
            t.upload_id === taskId
              ? { ...t, status: 'failed' }
              : t
          )
        );
        return;
      }

      performUpload(task, taskFile.file, taskFile.type, taskFile.title, onMessage);
    } catch (err) {
      console.error('恢复上传失败:', err);
      onMessage?.('error', err instanceof Error ? err.message : '恢复上传失败');
      setUploadTasks(prev =>
        prev.map(t =>
          t.upload_id === taskId
            ? { ...t, status: 'failed' }
            : t
        )
      );
    }
  }, [uploadTaskFiles, performUpload]);

  // 删除上传任务
  const handleDeleteUploadTask = useCallback(async (taskId: string, onMessage?: (type: 'success' | 'error', text: string) => void) => {
    try {
      await api.deleteUploadTask(taskId);

      setUploadTaskFiles(prev => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      const controller = uploadControllers.get(taskId);
      if (controller) {
        controller.abort();
      }
      setUploadControllers(prev => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      setUploadSpeeds(prev => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      setUploadTasks(prev => prev.filter(t => t.upload_id !== taskId));
      onMessage?.('success', '上传任务已删除');
    } catch (err) {
      onMessage?.('error', err instanceof Error ? err.message : '删除上传任务失败');
    }
  }, [uploadControllers]);

  // 开始上传
  const handleStartUpload = useCallback(async (
    file: File,
    type: 'movie' | 'tvshow',
    title: string,
    onMessage?: (type: 'success' | 'error', text: string) => void,
    onRefreshStagingMedias?: () => void
  ) => {
    try {
      const { calculateFileMd5 } = await import('../constants');
      const fileMd5 = await calculateFileMd5(file);

      const task = await api.createUploadTask({
        file_name: title ?? file.name,
        file_size: file.size,
        file_md5: fileMd5,
        chunk_size: CHUNK_SIZE,
      });

      setUploadTaskFiles(prev => new Map(prev).set(task.upload_id, { file, type, title }));

      onMessage?.('success', '上传任务已创建');
      setUploadTasks(prev => [...prev, task]);

      performUpload(task, file, type, title, onMessage, onRefreshStagingMedias);
    } catch (err) {
      onMessage?.('error', err instanceof Error ? err.message : '创建上传任务失败');
    }
  }, [performUpload]);

  return {
    uploadTasks,
    uploadSpeeds,
    handleStartUpload,
    handlePauseUpload,
    handleResumeUpload,
    handleDeleteUploadTask,
  };
}
