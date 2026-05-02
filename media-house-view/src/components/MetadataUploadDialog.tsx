import { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  LinearProgress,
  IconButton,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import JSZip from 'jszip';
import { ZipUploadTab } from './ZipUploadTab';
import { FolderUploadTab } from './FolderUploadTab';

interface MetadataUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  mediaTitle: string;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.ts', '.m2ts', '.mpeg', '.mpg', '.m4v'
];

export function MetadataUploadDialog({ open, onClose, onUpload, mediaTitle }: MetadataUploadDialogProps) {
  const zipFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [tabValue, setTabValue] = useState(0);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleZipFileSelect = (file: File) => {
    setZipFile(file);
    setError(null);
    setUploadSuccess(false);
  };

  const handleFolderSelect = (files: any[]) => {
    setFolderFiles(files);
    setError(null);
    setUploadSuccess(false);
  };

  const handleZipUpload = async () => {
    if (!zipFile) return;

    try {
      setUploading(true);
      setError(null);
      await onUpload(zipFile);
      setUploadSuccess(true);
      setZipFile(null);
      if (zipFileInputRef.current) {
        zipFileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleFolderUpload = async () => {
    if (folderFiles.length === 0) return;

    try {
      setUploading(true);
      setError(null);

      // 创建zip并压缩文件
      const zip = new JSZip();
      const validFiles = folderFiles.filter((f: any) => {
        const check = shouldIgnoreFile(f.file.name, f.file.size);
        return !check.ignore;
      });

      if (validFiles.length === 0) {
        throw new Error('没有符合条件的文件可压缩');
      }

      for (const f of validFiles) {
        zip.file(f.path, f.file);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'metadata.zip', { type: 'application/zip' });

      await onUpload(zipFile);
      setUploadSuccess(true);
      setFolderFiles([]);
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
    } catch (err) {
      console.log('上传失败', err);
      setError(err instanceof Error ? err.message : '压缩上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setZipFile(null);
    setFolderFiles([]);
    setError(null);
    setUploadSuccess(false);
    if (zipFileInputRef.current) {
      zipFileInputRef.current.value = '';
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
    onClose();
  };

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function shouldIgnoreFile(name: string, size: number): { ignore: boolean; reason?: string } {
    const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
    if (VIDEO_EXTENSIONS.includes(ext)) {
      return { ignore: true, reason: '视频文件' };
    }
    if (size > MAX_FILE_SIZE) {
      return { ignore: true, reason: `文件过大（${formatFileSize(size)}）` };
    }
    return { ignore: false };
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">上传元数据</Typography>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {!uploadSuccess ? (
          <>
            <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
              <Tab label="上传zip文件" />
              <Tab label="选择文件夹压缩" />
            </Tabs>

            {/* Tab 1: 上传zip文件 */}
            {tabValue === 0 && (
              <ZipUploadTab
                mediaTitle={mediaTitle}
                selectedFile={zipFile}
                onFileSelect={handleZipFileSelect}
                inputRef={zipFileInputRef}
              />
            )}

            {/* Tab 2: 选择文件夹压缩 */}
            {tabValue === 1 && (
              <FolderUploadTab
                mediaTitle={mediaTitle}
                folderFiles={folderFiles}
                onFolderSelect={handleFolderSelect}
                onClearFiles={() => setFolderFiles([])}
                inputRef={folderInputRef}
              />
            )}

            {uploading && (
              <Box sx={{ mt: 3 }}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {tabValue === 0 ? '上传中...' : '压缩并上传中...'}
                </Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
          </>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Alert severity="success" sx={{ mb: 3 }}>
              元数据文件上传成功！
            </Alert>
            <Typography variant="body1" gutterBottom>
              请刷新页面以查看更新后的元数据
            </Typography>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => window.location.reload()}
              sx={{ mt: 2 }}
            >
              刷新页面
            </Button>
          </Box>
        )}
      </DialogContent>

      {!uploadSuccess && (
        <DialogActions>
          <Button onClick={handleClose} disabled={uploading}>
            取消
          </Button>
          {tabValue === 0 && (
            <Button
              onClick={handleZipUpload}
              variant="contained"
              disabled={!zipFile || uploading}
            >
              {uploading ? '上传中...' : '上传'}
            </Button>
          )}
          {tabValue === 1 && (
            <Button
              onClick={handleFolderUpload}
              variant="contained"
              disabled={folderFiles.length === 0 || uploading}
            >
              {uploading ? '压缩中...' : '压缩并上传'}
            </Button>
          )}
        </DialogActions>
      )}
    </Dialog>
  );
}
