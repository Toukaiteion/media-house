import { useState } from 'react';
import {
  Container,
  Tabs,
  Tab,
  Alert,
  Badge,
} from '@mui/material';
import type { StagingMedia } from '../../../types';
import { MediaEditDialog } from '../../../components/MediaEditDialog';
import { MetadataScrapeDialog } from '../../../components/MetadataScrapeDialog';
import { PublishDialog } from '../../../components/PublishDialog';
import { MediaPublishHeader } from './components/MediaPublishHeader';
import { StagingMediaTab } from './components/StagingMediaTab';
import { UploadTaskTab } from './components/UploadTaskTab';
import { UploadDialog } from './components/UploadDialog';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { FolderUploadDialog, type FileNode } from './components/FolderUploadDialog';
import { useStagingMedias } from './hooks/useStagingMedias';
import { useUploadTasks } from './hooks/useUploadTasks';
import { useLibraries } from './hooks/useLibraries';
import { usePlugins } from './hooks/usePlugins';
import { useFolderUpload } from './hooks/useFolderUpload';
import { api } from '../../../services/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <div style={{ paddingTop: 16 }}>{children}</div>}
    </div>
  );
}

export function MediaPublishPage() {
  // Tab 状态
  const [tabValue, setTabValue] = useState(0);

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Hooks
  const { stagingMedias, loadingMedias, mediaError, refreshStagingMedias } = useStagingMedias();
  const {
    uploadTasks,
    uploadSpeeds,
    handleStartUpload,
    handlePauseUpload,
    handleResumeUpload,
    handleDeleteUploadTask,
  } = useUploadTasks();
  const {
    folderTasks,
    uploadSpeeds: folderUploadSpeeds,
    startFolderUpload,
    deleteFolderUploadTask,
  } = useFolderUpload();
  const { libraries } = useLibraries();
  const { plugins, pluginsConfig } = usePlugins();

  // 上传对话框状态
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // 编辑对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<StagingMedia | null>(null);

  // 搜刮对话框状态
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);

  // 发布对话框状态
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [mediaToPublish, setMediaToPublish] = useState<StagingMedia | null>(null);

  // 删除对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<StagingMedia | null>(null);

  // 文件夹上传对话框状态
  const [folderUploadDialogOpen, setFolderUploadDialogOpen] = useState(false);

  // 处理消息
  const handleMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
  };

  // 打开上传对话框
  const handleOpenUploadDialog = () => {
    setUploadDialogOpen(true);
  };

  // 关闭上传对话框
  const handleCloseUploadDialog = () => {
    setUploadDialogOpen(false);
  };

  // 开始上传
  const handleUploadStart = async (file: File, type: 'movie' | 'tvshow', title: string) => {
    setTabValue(1);
    await handleStartUpload(file, type, title, handleMessage, refreshStagingMedias);
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
    setEditDialogOpen(true);
  };

  // 应用搜刮结果
  const handleApplyScrapeResult = (_metadata: Record<string, any>) => {
    handleMessage('success', '元数据已应用');
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
      handleMessage('success', '媒体已成功发布');
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
      handleMessage('success', '媒体已删除');
    } catch (err) {
      handleMessage('error', err instanceof Error ? err.message : '删除媒体失败');
    }
  };

  // 取消删除
  const handleCancelDeleteMedia = () => {
    setDeleteDialogOpen(false);
    setMediaToDelete(null);
  };

  // 打开文件夹上传对话框
  const handleOpenFolderUploadDialog = () => {
    setFolderUploadDialogOpen(true);
  };

  // 关闭文件夹上传对话框
  const handleCloseFolderUploadDialog = () => {
    setFolderUploadDialogOpen(false);
  };

  // 开始文件夹上传
  const handleFolderUploadStart = async (files: FileNode[]) => {
    setTabValue(1); // 切换到上传任务标签页
    startFolderUpload(files, handleMessage);
  };

  // 删除文件夹上传任务
  const handleDeleteFolderTask = async (folderId: string) => {
    await deleteFolderUploadTask(folderId, handleMessage);
  };

  const uploadingCount = uploadTasks.filter(task => task.status === 'uploading').length;
  const uploadingFolderCount = folderTasks.filter(t => t.status === 'uploading').length;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* 顶部栏 */}
      <MediaPublishHeader
        tabValue={tabValue}
        onRefresh={refreshStagingMedias}
        onOpenUploadDialog={handleOpenUploadDialog}
        onOpenFolderUploadDialog={handleOpenFolderUploadDialog}
      />

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
          uploadingCount > 0 || uploadingFolderCount > 0 ? (
            <Badge badgeContent={uploadingCount + uploadingFolderCount} color="error">
              上传任务
            </Badge>
          ) : (
            uploadTasks.length + folderTasks.length > 0
              ? `上传任务 (${uploadTasks.length + folderTasks.length})`
              : '上传任务'
          )
        } />
      </Tabs>

      {/* Tab 1: 待发布媒体 */}
      <TabPanel value={tabValue} index={0}>
        <StagingMediaTab
          medias={stagingMedias}
          loading={loadingMedias}
          error={mediaError}
          onEdit={handleEditMedia}
          onPublish={handlePublishMedia}
          onDelete={handleDeleteMedia}
          onOpenUploadDialog={handleOpenUploadDialog}
        />
      </TabPanel>

      {/* Tab 2: 上传任务 */}
      <TabPanel value={tabValue} index={1}>
        <UploadTaskTab
          tasks={uploadTasks}
          folderTasks={folderTasks}
          uploadSpeeds={uploadSpeeds}
          folderUploadSpeeds={folderUploadSpeeds}
          onPause={handlePauseUpload}
          onResume={handleResumeUpload}
          onDeleteUpload={handleDeleteUploadTask}
          onDeleteFolder={handleDeleteFolderTask}
        />
      </TabPanel>

      {/* 上传对话框 */}
      <UploadDialog
        open={uploadDialogOpen}
        onClose={handleCloseUploadDialog}
        onStartUpload={handleUploadStart}
      />

      {/* 文件夹上传对话框 */}
      <FolderUploadDialog
        open={folderUploadDialogOpen}
        onClose={handleCloseFolderUploadDialog}
        onStartUpload={handleFolderUploadStart}
      />

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
        stagingMediaId={selectedMedia?.id}
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
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        media={mediaToDelete}
        onConfirm={handleConfirmDeleteMedia}
        onCancel={handleCancelDeleteMedia}
      />
    </Container>
  );
}
