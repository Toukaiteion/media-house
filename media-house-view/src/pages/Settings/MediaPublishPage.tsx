import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
  TextField,
  Chip,
  Badge,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import { api } from '../../services/api';
import { UploadTaskCard } from '../../components/UploadTaskCard';
import { StagingMediaCard } from '../../components/StagingMediaCard';
import { MediaEditDialog } from '../../components/MediaEditDialog';
import { MetadataScrapeDialog } from '../../components/MetadataScrapeDialog';
import { PublishDialog } from '../../components/PublishDialog';
import type { UploadTask, StagingMedia, Plugin, PluginConfig, MediaLibrary } from '../../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const CONCURRENCY = 3; // 并发上传数

// 计算文件 MD5
async function calculateFileMd5(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 上传单个分片（带重试）
const uploadChunkWithRetry = async (
  uploadId: string,
  file: File,
  chunkIndex: number,
  onProgress?: () => void,
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

      await api.uploadChunk(uploadId, chunkIndex, chunk);
      onProgress?.();
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

export function MediaPublishPage() {
  // Tab 状态
  const [tabValue, setTabValue] = useState(0);

  // 上传任务状态
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 存储上传任务的文件引用（用于恢复时获取原文件）
  const [uploadTaskFiles, setUploadTaskFiles] = useState<Map<string, { file: File; type: 'movie' | 'tvshow'; title: string }>>(new Map());

  // 存储上传任务的 AbortController（用于取消上传）
  const [uploadControllers, setUploadControllers] = useState<Map<string, AbortController>>(new Map());

  // 上传速度状态
  const [uploadSpeeds, setUploadSpeeds] = useState<Map<string, number>>(new Map());

  // 待发布媒体状态
  const [stagingMedias, setStagingMedias] = useState<StagingMedia[]>([]);
  const [loadingMedias, setLoadingMedias] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // 媒体库列表
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);

  // 插件和配置
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [pluginsConfig, setPluginsConfig] = useState<Map<string, PluginConfig[]>>(new Map());

  // 对话框状态
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<'movie' | 'tvshow'>('movie');
  const [mediaTitle, setMediaTitle] = useState('');

  // 断点续传相关状态
  const [calculatingMd5, setCalculatingMd5] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<StagingMedia | null>(null);

  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);

  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [mediaToPublish, setMediaToPublish] = useState<StagingMedia | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<StagingMedia | null>(null);

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 计算正在上传的任务数量
  const uploadingCount = uploadTasks.filter(task => task.status === 'uploading').length;
  // 加载待发布媒体
  const refreshStagingMedias = async () => {
    try {
      setLoadingMedias(true);
      setMediaError(null);
      const data = await api.getStagingMedias();
      setStagingMedias(data);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : '加载待发布媒体失败');
    } finally {
      setLoadingMedias(false);
    }
  };

  // 加载媒体库
  const loadLibraries = async () => {
    try {
      const data = await api.getLibraries();
      setLibraries(data);
    } catch (err) {
      console.error('加载媒体库失败:', err);
    }
  };

  // 加载插件和配置
  const loadPlugins = async () => {
    try {
      const data = await api.getPlugins();
      setPlugins(data);

      // 加载每个插件的配置
      const configMap = new Map<string, PluginConfig[]>();
      for (const plugin of data) {
        try {
          const configs = await api.getPluginConfigs(plugin.plugin_key);
          configMap.set(plugin.plugin_key, configs);
        } catch (err) {
          console.error(`加载插件配置失败: ${plugin.plugin_key}`, err);
        }
      }
      setPluginsConfig(configMap);
    } catch (err) {
      console.error('加载插件失败:', err);
    }
  };

  useEffect(() => {
    refreshStagingMedias();
    loadLibraries();
    loadPlugins();
  }, []);

  // 打开上传对话框
  const handleOpenUploadDialog = () => {
    setUploadDialogOpen(true);
    setSelectedFile(null);
    setMediaType('movie');
    setMediaTitle('');
  };

  // 关闭上传对话框
  const handleCloseUploadDialog = () => {
    setUploadDialogOpen(false);
    setSelectedFile(null);
  };

  // 选择文件
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // 自动填充标题（去掉扩展名）
      const title = file.name.replace(/\.[^/.]+$/, '');
      setMediaTitle(title);
    }
  };

  // 开始上传
  const handleStartUpload = async () => {
    if (!selectedFile) return;

    try {
      setCalculatingMd5(true);

      // 计算 MD5
      const fileMd5 = await calculateFileMd5(selectedFile);

      // 创建上传任务（如果 MD5 匹配已存在的任务，会返回已有任务）
      const task = await api.createUploadTask({
        file_name: selectedFile.name,
        file_size: selectedFile.size,
        file_md5: fileMd5,
        chunk_size: CHUNK_SIZE,
      });

      // 保存文件引用用于恢复
      setUploadTaskFiles(prev => new Map(prev).set(task.upload_id, { file: selectedFile, type: mediaType, title: mediaTitle }));

      handleCloseUploadDialog();
      setMessage({ type: 'success', text: '上传任务已创建' });

      setUploadTasks(prev => [...prev, task]);
      setTabValue(1);
      // 执行分片上传
      performUpload(task, selectedFile, mediaType, mediaTitle);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '创建上传任务失败' });
    } finally {
      setCalculatingMd5(false);
    }
  };

  // 执行合并（处理缺失分片）
  const performMerge = async (uploadId: string, type: 'movie' | 'tvshow', title: string) => {
    try {
      const result = await api.mergeUpload({
        upload_id: uploadId,
        type,
        title: title || undefined,
      });

      if (result.success) {
        setMessage({ type: 'success', text: '上传完成' });
        setUploadTasks(prev => prev.map(task => task.upload_id === uploadId ? { ...task, status: 'completed' } : task))
        refreshStagingMedias();
      } else if (result.error === 'missing_chunks') {
        // 有缺失的分片，重新上传
        const file = await findFileForTask(uploadId);
        if (!file) {
          setMessage({ type: 'error', text: '无法找到对应的文件，请重新选择文件' });
          return;
        }

        await uploadMissingChunks(uploadId, file, result.missing_chunks);

        // 再次尝试合并
        await performMerge(uploadId, type, title);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '完成上传失败' });
    }
  };

  // 查找任务对应的文件（从当前选中的文件）
  const findFileForTask = async (_uploadId: string): Promise<File | null> => {
    // 简单实现：使用当前选中的文件
    // 实际场景可能需要让用户重新选择文件
    return selectedFile || null;
  };

  // 上传缺失的分片
  const uploadMissingChunks = async (uploadId: string, file: File, missingChunks: number[]) => {
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
            uploadedChunkIndices.add(chunkIndex); // 只添加索引，不直接更新 UI
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
      if (now - lastUpdateTime < 300) return; // 限制更新频率
      lastUpdateTime = now;

      const currentUploaded = uploadedChunkIndices.size;
      if (currentUploaded > 0) {
        const uploadedSize = Math.min(currentUploaded * CHUNK_SIZE, file.size);
        setUploadTasks(prev =>
          prev.map(t =>
            t.upload_id === uploadId
              ? { ...t, uploaded_chunks: currentUploaded, uploaded_size: uploadedSize, status: 'uploading' }
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
  };

  // 执行分片上传
  const performUpload = async (task: UploadTask, file: File, type: 'movie' | 'tvshow', title: string) => {
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

    // 使用 Set 追踪已上传的分片索引（避免竞态条件）
    // 初始已上传数 = 总数 - 待上传数
    const startUploadedCount = task.uploaded_chunks || 0;
    const uploadedChunkIndices = new Set<number>();
    let lastUpdateTime = 0;

    // 速度计算
    const startTime = Date.now();
    const startBytes = task.uploaded_size || 0;
    let updateInterval = null;

    // 定期更新 UI 和速度
    updateInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastUpdateTime < 300) return; // 限制更新频率
      lastUpdateTime = now;

      const currentUploaded = startUploadedCount + uploadedChunkIndices.size;
      if (currentUploaded > 0) {
        const uploadedSize = Math.min(currentUploaded * CHUNK_SIZE, file.size);
        setUploadTasks(prev =>
          prev.map(t =>
            t.upload_id === uploadId
              ? { ...t, uploaded_chunks: currentUploaded, uploaded_size: uploadedSize }
              : t
          )
        );

        // 速度计算
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
            uploadedChunkIndices.add(chunkIndex); // 只添加索引，不直接更新 UI
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
      // 清理更新定时器
      if (updateInterval) clearInterval(updateInterval);
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

      // 检查是否是用户取消
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 用户主动暂停，不需要显示错误消息
        return;
      }

      console.error('上传失败:', err);
      setMessage({ type: 'error', text: `上传失败: ${err instanceof Error ? err.message : '未知错误'}` });
      return;
    }

    // 所有分片上传完成，请求合并
    await performMerge(uploadId, type, title);
    if (updateInterval) clearInterval(updateInterval);
  };

  // 暂停上传
  const handlePauseUpload = async (taskId: string) => {
    try {
      // 获取 AbortController 并取消
      const controller = uploadControllers.get(taskId);
      if (controller) {
        controller.abort();
        setUploadControllers(prev => {
          const next = new Map(prev);
          next.delete(taskId);
          return next;
        });
      }

      // 更新任务状态
      setUploadTasks(prev =>
        prev.map(task =>
          task.upload_id === taskId
            ? { ...task, status: 'paused' }
            : task
        )
      );

      // 清理速度
      setUploadSpeeds(prev => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });
    } catch (err) {
      console.error('暂停上传失败:', err);
    }
  };

  // 恢复上传
  const handleResumeUpload = async (taskId: string) => {
    try {
      // 更新状态为上传中
      setUploadTasks(prev =>
        prev.map(task =>
          task.upload_id === taskId
            ? { ...task, status: 'uploading' }
            : task
        )
      );

      // 从 API 获取任务最新状态
      const task = await api.getUploadTask(taskId);

      // 获取文件引用
      const taskFile = uploadTaskFiles.get(taskId);
      if (!taskFile) {
        setMessage({ type: 'error', text: '无法找到对应的文件，请重新上传' });
        setUploadTasks(prev =>
          prev.map(t =>
            t.upload_id === taskId
              ? { ...t, status: 'failed' }
              : t
          )
        );
        return;
      }

      // 执行上传
      performUpload(task, taskFile.file, taskFile.type, taskFile.title);
    } catch (err) {
      console.error('恢复上传失败:', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '恢复上传失败' });
      setUploadTasks(prev =>
        prev.map(t =>
          t.upload_id === taskId
            ? { ...t, status: 'failed' }
            : t
        )
      );
    }
  };

  // 删除上传任务
  const handleDeleteUploadTask = async (taskId: string) => {
    try {
      await api.deleteUploadTask(taskId);

      // 清理文件引用
      setUploadTaskFiles(prev => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      // 清理 AbortController
      const controller = uploadControllers.get(taskId);
      if (controller) {
        controller.abort();
      }
      setUploadControllers(prev => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      // 清理速度
      setUploadSpeeds(prev => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      setMessage({ type: 'success', text: '上传任务已删除' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '删除上传任务失败' });
    }
  };

  // 编辑媒体
  const handleEditMedia = (media: StagingMedia) => {
    setSelectedMedia(media);
    setEditDialogOpen(true);
  };

  // 关闭编辑对话框
  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setSelectedMedia(null);
  };

  // 打开搜刮对话框
  const handleOpenScrapeDialog = () => {
    setEditDialogOpen(false);
    setScrapeDialogOpen(true);
  };

  // 关闭搜刮对话框
  const handleCloseScrapeDialog = () => {
    setScrapeDialogOpen(false);
    setEditDialogOpen(true); // 回到编辑对话框
  };

  // 应用搜刮结果
  const handleApplyScrapeResult = (_metadata: Record<string, any>) => {
    // 这里需要更新编辑对话框中的表单数据
    // 暂时简单处理，实际需要通过回调或状态提升
    setMessage({ type: 'success', text: '元数据已应用' });
  };

  // 发布媒体
  const handlePublishMedia = (media: StagingMedia) => {
    setMediaToPublish(media);
    setPublishDialogOpen(true);
  };

  // 关闭发布对话框
  const handleClosePublishDialog = () => {
    setPublishDialogOpen(false);
    setMediaToPublish(null);
  };

  // 执行发布
  const handleExecutePublish = async (request: { library_id: number; media_name: string }) => {
    if (!mediaToPublish) return;

    try {
      await api.publishStagingMedia(mediaToPublish.id, request);
      refreshStagingMedias();
      setMessage({ type: 'success', text: '媒体已成功发布' });
    } catch (err) {
      throw err;
    }
  };

  // 删除媒体
  const handleDeleteMedia = (media: StagingMedia) => {
    setMediaToDelete(media);
    setDeleteDialogOpen(true);
  };

  // 确认删除
  const handleConfirmDeleteMedia = async () => {
    if (!mediaToDelete) return;

    try {
      await api.deleteStagingMedia(mediaToDelete.id);
      setDeleteDialogOpen(false);
      setMediaToDelete(null);
      refreshStagingMedias();
      setMessage({ type: 'success', text: '媒体已删除' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '删除媒体失败' });
    }
  };

  // 取消删除
  const handleCancelDeleteMedia = () => {
    setDeleteDialogOpen(false);
    setMediaToDelete(null);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* 顶部栏 */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4">媒体发布</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={() => { { refreshStagingMedias(); } }} aria-label="刷新">
            <RefreshIcon />
          </IconButton>
          {tabValue === 0 && (
            <Button variant="contained" startIcon={<UploadIcon />} onClick={handleOpenUploadDialog}>
              上传媒体
            </Button>
          )}
        </Box>
      </Box>

      {/* 消息提示 */}
      {message && (
        <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Tab 切换 */}
      <Tabs
        value={tabValue}
        onChange={(_, v) => setTabValue(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label={`待发布媒体 (${stagingMedias.length})`} />
        <Tab label={
          uploadingCount > 0 ? (
            <Badge badgeContent={uploadingCount} color="error">
              上传任务
            </Badge>
          ) : (
            uploadTasks.length > 0 ? `上传任务 (${uploadTasks.length})` : '上传任务'
          )
        } />
      </Tabs>

      {/* Tab 1: 待发布媒体 */}
      <TabPanel value={tabValue} index={0}>
        {loadingMedias ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : stagingMedias.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              暂无待发布媒体
            </Typography>
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={handleOpenUploadDialog}
              sx={{ mt: 2 }}
            >
              上传新媒体
            </Button>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {stagingMedias.map((media) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={media.id}>
                <StagingMediaCard
                  media={media}
                  onEdit={handleEditMedia}
                  onPublish={handlePublishMedia}
                  onDelete={() => { { handleDeleteMedia(media); } }}
                />
              </Grid>
            ))}
          </Grid>
        )}

        {mediaError && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setMediaError(null)}>
            {mediaError}
          </Alert>
        )}
      </TabPanel>

      {/* Tab 2: 上传任务 */}
      <TabPanel value={tabValue} index={1}>
        {uploadTasks.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              暂无上传任务
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              切换到"待发布媒体"标签页上传新媒体
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {uploadTasks.map((task) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={task.upload_id}>
                <UploadTaskCard
                  task={task}
                  speed={uploadSpeeds.get(task.upload_id)}
                  onPause={handlePauseUpload}
                  onResume={handleResumeUpload}
                  onDelete={handleDeleteUploadTask}
                />
              </Grid>
            ))}
          </Grid>
        )}

        {uploadError && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setUploadError(null)}>
            {uploadError}
          </Alert>
        )}
      </TabPanel>

      {/* 上传对话框 */}
      <Dialog open={uploadDialogOpen} onClose={handleCloseUploadDialog} maxWidth="sm" fullWidth>
        <DialogTitle>上传新媒体</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="标题"
            value={mediaTitle}
            onChange={(e) => setMediaTitle(e.target.value)}
            helperText="可留空，将使用文件名"
            sx={{ mb: 2 }}
          />

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>媒体类型</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip
                label="电影"
                clickable
                color={mediaType === 'movie' ? 'primary' : 'default'}
                onClick={() => setMediaType('movie')}
              />
              <Chip
                label="电视剧"
                clickable
                color={mediaType === 'tvshow' ? 'primary' : 'default'}
                onClick={() => setMediaType('tvshow')}
              />
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>选择文件</Typography>
            <input
              type="file"
            accept="video/*"
              onChange={handleFileChange}
              style={{ display: 'block', width: '100%' }}
            />
            {selectedFile && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                已选择: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUploadDialog}>取消</Button>
          <Button onClick={handleStartUpload} variant="contained" disabled={!selectedFile || calculatingMd5}>
            {calculatingMd5 ? '计算中...' : '开始上传'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 编辑媒体对话框 */}
      <MediaEditDialog
        open={editDialogOpen}
        media={selectedMedia}
        onClose={handleCloseEditDialog}
        onSave={refreshStagingMedias}
        onScrape={handleOpenScrapeDialog}
      />

      {/* 搜刮元数据对话框 */}
      <MetadataScrapeDialog
        open={scrapeDialogOpen}
        mediaTitle={selectedMedia?.title}
        mediaYear={selectedMedia?.year}
        plugins={plugins}
        pluginsConfig={pluginsConfig}
        onClose={handleCloseScrapeDialog}
        onApply={handleApplyScrapeResult}
      />

      {/* 发布对话框对话框 */}
      {mediaToPublish && (
        <PublishDialog
          open={publishDialogOpen}
          defaultTitle={mediaToPublish.title}
          libraries={libraries}
          mediaType={mediaToPublish.type}
          onClose={handleClosePublishDialog}
          onPublish={handleExecutePublish}
        />
      )}

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={handleCancelDeleteMedia} maxWidth="xs">
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除媒体 "{mediaToDelete?.title}" 吗？此操作不可撤销，将删除所有相关文件。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteMedia}>取消</Button>
          <Button onClick={handleConfirmDeleteMedia} color="error" variant="contained">
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
