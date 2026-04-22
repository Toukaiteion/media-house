/**
 * 上传常量定义
 */

import SparkMD5 from 'spark-md5';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
export const CONCURRENCY = 3; // 并发上传数

// MD5计算分片大小 - 20MB，避免单次读取过大导致内存问题
const MD5_CHUNK_SIZE = 20 * 1024 * 1024;

/**
 * 计算文件 MD5（增量式，支持大文件）
 * @param file 文件对象
 * @param onProgress 进度回调（可选）
 * @returns MD5哈希值
 */
export async function calculateFileMd5(file: File, onProgress?: (progress: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks = Math.ceil(file.size / MD5_CHUNK_SIZE);
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();
    let currentChunk = 0;

    fileReader.onload = (e) => {
      if (!e.target) {
        reject(new Error('FileReader load failed'));
        return;
      }
      const arrayBuffer = e.target.result as ArrayBuffer;
      spark.append(arrayBuffer);

      currentChunk++;

      if (currentChunk < chunks) {
        loadNext();
      } else {
        // 所有分片读取完成
        const md5 = spark.end();
        resolve(md5);
      }

      // 触发进度回调
      if (onProgress) {
        const progress = Math.min(currentChunk / chunks, 1);
        onProgress(progress);
      }
    };

    fileReader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    const loadNext = () => {
      const start = currentChunk * MD5_CHUNK_SIZE;
      const end = Math.min(start + MD5_CHUNK_SIZE, file.size);
      fileReader.readAsArrayBuffer(file.slice(start, end));
    };

    loadNext();
  });
}

/**
 * 上传单个分片（带重试）
 */
export const uploadChunkWithRetry = async (
  uploadId: string,
  file: File,
  chunkIndex: number,
  onUpload: () => void,
  retries = 3,
  signal?: AbortSignal
): Promise<void> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    // 检查是否被取消
    if (signal?.aborted) {
      throw new DOMException('Upload was aborted', 'AbortError');
    }

    try {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const { api } = await import('../../../services/api');
      await api.uploadChunk(uploadId, chunkIndex, chunk);
      onUpload();
      return;
    } catch (err) {
      // 如果是取消错误，直接抛出
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        console.log('Upload cancelled', err);
        throw err;
      }
      console.log(`Chunk ${chunkIndex} upload failed (attempt ${attempt + 1}/${retries})`, err);
      if (attempt === retries - 1) {
        console.log(`Chunk ${chunkIndex} upload failed after ${retries} attempts`, err);
        throw err;
      }
      // 指数退避
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
};
