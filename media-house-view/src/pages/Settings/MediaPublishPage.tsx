import { useState, useEffect, useRef } from 'react';
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
  List,
  ListItem,
  ListItemText,
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

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// 格式化日期
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 计算文件 MD5
async function calculateFileMd5(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function MediaPublishPage() {
  // Tab 状态
  const [tabValue, setTabValue] = useState(0);

  // 上传任务状态
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploadingTasks, setUploadingTasks] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [existingUploadTask, setExistingUploadTask] = useState<UploadTask | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<StagingMedia | null>(null);

  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);

  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [mediaToPublish, setMediaToPublish] = useState<StagingMedia | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<StagingMedia | null>(null);

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 上传进度跟踪
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载上传任务
  const refreshUploadTasks = async () => {
    try {
      setUploadingTasks(true);
      setUploadError(null);
      const data = await api.getUploadTasks();
      setUploadTasks(data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '加载上传任务失败');
    } finally {
      setUploadingTasks(false);
    }
  };

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

  // 初始化加载
  useEffect(() => {
    refreshUploadTasks();
    refreshStagingMedias();
    loadLibraries();
    loadPlugins();
  }, []);

  // 上传进度轮询
  useEffect(() => {
    const startProgressPolling = () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      progressIntervalRef.current = setInterval(async () => {
        const activeTasks = uploadTasks.filter(
          t => t.status === 'uploading' || t.status === 'pending'
        );

        if (activeTasks.length === 0) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          return;
        }

        // 更新进度
        for (const task of activeTasks) {
          try {
            const progress = await api.getUploadProgress(task.upload_id);
            setUploadTasks(prev =>
              prev.map(t =>
                t.upload_id === task.upload_id
                  ? { ...t, ...progress }
                  : t
              )
            );

            // 检查是否完成
            if (progress.status === 'completed') {
              refreshUploadTasks();
              refreshStagingMedias();
            }
          } catch (err) {
            console.error('获取上传进度失败:', err);
          }
        }
      }, 1000);
    };

    startProgressPolling();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [uploadTasks]);

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

      // 检查是否为新任务
      if (!task.is_new) {
        // 验证文件大小是否匹配
        if (task.file_size !== selectedFile.size) {
          throw new Error('文件大小不匹配，请选择正确的文件');
        }
        // 显示恢复对话框
        setExistingUploadTask(task);
        setResumeDialogOpen(true);
        setCalculatingMd5(false);
        return;
      }

      handleCloseUploadDialog();
      setMessage({ type: 'success', text: '上传任务已创建' });

      // 执行分片上传
      performUpload(task.upload_id, selectedFile, mediaType, mediaTitle);
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
        refreshUploadTasks();
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
    let uploadedCount = 0;

    const uploadChunkWithRetry = async (chunkIndex: number, retries = 3): Promise<void> => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          await api.uploadChunk(uploadId, chunkIndex, chunk);
          uploadedCount++;

          // 更新本地进度
          setUploadTasks(prev =>
            prev.map(t =>
              t.upload_id === uploadId
                ? {
                    ...t,
                    uploaded_chunks: uploadedCount,
                    uploaded_size: Math.min(uploadedCount * CHUNK_SIZE, file.size),
                    status: 'uploading',
                  }
                : t
            )
          );
          return;
        } catch (err) {
          if (attempt === retries - 1) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    };

    const workers: Promise<void>[] = [];
    const workerCount = Math.min(CONCURRENCY, chunkQueue.length);

    const runWorker = async () => {
      while (chunkQueue.length > 0) {
        const chunkIndex = chunkQueue.shift();
        if (chunkIndex !== undefined) {
          await uploadChunkWithRetry(chunkIndex);
        }
      }
    };

    for (let i = 0; i < workerCount; i++) {
      workers.push(runWorker());
    }

    await Promise.all(workers);
  };

  // 执行分片上传
  const performUpload = async (uploadId: string, file: File, type: 'movie' | 'tvshow', title: string) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunkQueue = Array.from({ length: totalChunks }, (_, i) => i);
    let uploadedChunks = 0;

    // 上传单个分片（带重试）
    const uploadChunkWithRetry = async (chunkIndex: number, retries = 3): Promise<void> => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          await api.uploadChunk(uploadId, chunkIndex, chunk);
          uploadedChunks++;

          // 更新本地进度
          setUploadTasks(prev =>
            prev.map(t =>
              t.upload_id === uploadId
                ? {
                    ...t,
                    uploaded_chunks: uploadedChunks,
                    uploaded_size: end,
                    status: 'uploading',
                  }
                : t
            )
          );
          return;
        } catch (err) {
          if (attempt === retries - 1) throw err;
          // 指数退避
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    };

    // 并发上传
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(CONCURRENCY, chunkQueue.length);

    const runWorker = async () => {
      while (chunkQueue.length > 0) {
        const chunkIndex = chunkQueue.shift();
        if (chunkIndex !== undefined) {
          await uploadChunkWithRetry(chunkIndex);
        }
      }
    };

    for (let i = 0; i < workerCount; i++) {
      workers.push(runWorker());
    }

    try {
      await Promise.all(workers);
    } catch (err) {
      console.error('上传失败:', err);
      setMessage({ type: 'error', text: `上传失败: ${err instanceof Error ? err.message : '未知错误'}` });
      refreshUploadTasks();
      return;
    }

    // 所有分片上传完成，请求合并
    await performMerge(uploadId, type, title);
  };

  // 暂停上传
  const handlePauseUpload = async (taskId: string) => {
    try {
      await api.pauseUpload(taskId);
      refreshUploadTasks();
    } catch (err) {
      console.error('暂停上传失败:', err);
    }
  };

  // 恢复上传
  const handleResumeUpload = async (taskId: string) => {
    try {
      await api.resumeUpload(taskId);
      refreshUploadTasks();
    } catch (err) {
      console.error('恢复上传失败:', err);
    }
  };

  // 确认恢复上传
  const handleConfirmResume = async () => {
    if (!existingUploadTask || !selectedFile) return;

    setResumeDialogOpen(false);
    handleCloseUploadDialog();

    try {
      // 检查已上传的分片
      const checkResult = await api.checkUploadedChunks(existingUploadTask.upload_id, 0);

      // 计算缺失的分片
      const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
      const missingChunks = checkResult.missing_chunks.length > 0
        ? checkResult.missing_chunks
        : Array.from({ length: totalChunks }, (_, i) => i).filter(i => i >= checkResult.to_index);

      if (missingChunks.length === 0) {
        // 所有分片已上传，直接合并
        await performMerge(existingUploadTask.upload_id, mediaType, mediaTitle);
      } else {
        // 上传缺失的分片
        await uploadMissingChunks(existingUploadTask.upload_id, selectedFile, missingChunks);
        // 上传完成后合并
        await performMerge(existingUploadTask.upload_id, mediaType, mediaTitle);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '恢复上传失败' });
    }
  };

  // 拒绝恢复，删除旧任务
  const handleRejectResume = async () => {
    if (!existingUploadTask) return;

    try {
      await api.deleteUploadTask(existingUploadTask.upload_id);
      setResumeDialogOpen(false);
      setExistingUploadTask(null);
      setMessage({ type: 'success', text: '旧上传任务已删除，请重新开始上传' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '删除旧任务失败' });
    }
  };

  // 关闭恢复对话框
  const handleCloseResumeDialog = () => {
    setResumeDialogOpen(false);
    setExistingUploadTask(null);
  };

  // 删除上传任务
  const handleDeleteUploadTask = async (taskId: string) => {
    try {
      await api.deleteUploadTask(taskId);
      refreshUploadTasks();
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

;

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
          <IconButton onClick={() => { refreshUploadTasks(); refreshStagingMedias(); }} aria-label="刷新">
            <RefreshIcon />
          </IconButton>
          {tabValue === 1 && (
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
        <Tab label={`上传任务 (${uploadTasks.length})`} />
        <Tab label={`待发布媒体 (${stagingMedias.length})`} />
      </Tabs>

      {/* Tab 1: 上传任务 */}
      <TabPanel value={tabValue} index={0}>
        {uploadingTasks ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : uploadTasks.length === 0 ? (
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

      {/* Tab 2: 待发布媒体 */}
      <TabPanel value={tabValue} index={1}>
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
                  onDelete={() => { handleDeleteMedia(media); }}
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

      {/* 恢复上传对话框 */}
      {existingUploadTask && (
        <Dialog open={resumeDialogOpen} onClose={handleCloseResumeDialog} maxWidth="sm" fullWidth>
          <DialogTitle>发现未完成的上传</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              检测到您之前正在上传 "{existingUploadTask.file_name}"，已上传 {((existingUploadTask.uploaded_size / existingUploadTask.file_size) * 100).toFixed(1)}%。
              您可以继续上传或删除旧任务重新开始。
            </Alert>
            <List dense>
              <ListItem>
                <ListItemText primary="文件大小" secondary={formatFileSize(existingUploadTask.file_size)} />
              </ListItem>
              <ListItem>
                <ListItemText primary="已上传" secondary={`${formatFileSize(existingUploadTask.uploaded_size)} / ${formatFileSize(existingUploadTask.file_size)}`} />
              </ListItem>
              <ListItem>
                <ListItemText primary="分片进度" secondary={`${existingUploadTask.uploaded_chunks} / ${existingUploadTask.total_chunks}`} />
              </ListItem>
              <ListItem>
                <ListItemText primary="创建时间" secondary={formatDate(existingUploadTask.created_at)} />
              </ListItem>
            </List>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleRejectResume} color="error">
              删除旧任务
            </Button>
            <Button onClick={handleConfirmResume} variant="contained" color="primary">
              继续上传
            </Button>
          </DialogActions>
        </Dialog>
      )}

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

      {/* 发布对话框 */}
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
