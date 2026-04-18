/**
 * 上传常量定义
 */

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
export const CONCURRENCY = 3; // 并发上传数

/**
 * 计算文件 MD5
 */
export async function calculateFileMd5(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
        throw err;
      }
      if (attempt === retries - 1) throw err;
      // 指数退避
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
};
