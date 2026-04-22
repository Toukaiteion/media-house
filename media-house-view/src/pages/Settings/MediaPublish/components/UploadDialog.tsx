import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  IconButton,
} from '@mui/material';
import {
  CloudUploadOutlined as CloudUploadOutlinedIcon,
  VideoFileOutlined as VideoFileIcon,
  DeleteOutlined as DeleteIcon,
} from '@mui/icons-material';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onStartUpload: (file: File, type: 'movie' | 'tvshow', title: string) => void;
}

export function UploadDialog({ open, onClose, onStartUpload }: UploadDialogProps) {
  const [mediaType, setMediaType] = useState<'movie' | 'tvshow'>('movie');
  const [mediaTitle, setMediaTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const title = file.name.replace(/\.[^/.]+$/, '');
      setMediaTitle(title);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setMediaTitle('');
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;
    onClose();
    onStartUpload(selectedFile, mediaType, mediaTitle);
    handleClose();
  };

  const handleClose = () => {
    onClose();
    setSelectedFile(null);
    setMediaType('movie');
    setMediaTitle('');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
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
            id="video-file-input"
            accept="video/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {!selectedFile ? (
            <Button
              variant="outlined"
              startIcon={<CloudUploadOutlinedIcon />}
              onClick={() => document.getElementById('video-file-input')?.click()}
              fullWidth
              sx={{
                height: 56,
                borderStyle: 'dashed',
                borderColor: 'text.secondary',
                '&:hover': {
                  borderStyle: 'solid',
                }
              }}
            >
              点击选择视频文件
            </Button>
          ) : (
            <Box
              sx={{
                p: 2,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: 'background.paper'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                <VideoFileIcon sx={{ color: 'primary.main', fontSize: 32 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedFile.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </Typography>
                </Box>
              </Box>
              <IconButton
                onClick={handleClearFile}
                size="small"
                sx={{ color: 'text.secondary', ml: 1 }}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>取消</Button>
        <Button onClick={handleStartUpload} variant="contained" disabled={!selectedFile}>
          开始上传
        </Button>
      </DialogActions>
    </Dialog>
  );
}
