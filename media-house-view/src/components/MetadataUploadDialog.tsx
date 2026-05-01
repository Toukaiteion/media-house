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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Close as CloseIcon,
  FolderZip as ZipIcon,
  Refresh as RefreshIcon,
  Folder as FolderIcon,
  Description as FileIcon,
  Image as ImageIcon,
} from '@mui/icons-material';

interface MetadataUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  mediaTitle: string;
}

export function MetadataUploadDialog({ open, onClose, onUpload, mediaTitle }: MetadataUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setUploadSuccess(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setError(null);
      await onUpload(selectedFile);
      setUploadSuccess(true);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setError(null);
    setUploadSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              上传包含电影元数据的zip文件到"{mediaTitle}"
            </Typography>

            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              {selectedFile ? (
                <Box>
                  <ZipIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
                  <Typography variant="subtitle1" gutterBottom>
                    {selectedFile.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Typography>
                </Box>
              ) : (
                <Box>
                  <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                  <Typography variant="subtitle1">点击选择zip文件</Typography>
                  <Typography variant="body2" color="text.secondary">
                    支持上传包含元数据的zip压缩包
                  </Typography>
                </Box>
              )}
            </Box>

            {/* 静态结构说明 */}
            <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Zip文件应包含的结构：
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <FileIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="movie.nfo - 电影信息文件" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <ImageIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="poster.jpg - 海报图片" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <ImageIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="fanart.jpg - 背景图片" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <FolderIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="extrathumbs/ - 截图目录" />
                </ListItem>
                <ListItem sx={{ pl: 4 }}>
                  <ListItemIcon>
                    <ImageIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="thumb1.jpg, thumb2.jpg, ..." />
                </ListItem>
              </List>
            </Box>

            {uploading && (
              <Box sx={{ mt: 3 }}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  上传中...
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
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={!selectedFile || uploading}
          >
            {uploading ? '上传中...' : '上传'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
