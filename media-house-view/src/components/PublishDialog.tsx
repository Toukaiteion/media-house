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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import type { MediaLibrary } from '../types';
import type { PublishRequest } from '../types';

interface PublishDialogProps {
  open: boolean;
  defaultTitle?: string;
  libraries: MediaLibrary[];
  mediaType: 'movie' | 'tvshow';
  onClose: () => void;
  onPublish: (request: PublishRequest) => Promise<void>;
}

export function PublishDialog({
  open,
  defaultTitle,
  libraries,
  mediaType,
  onClose,
  onPublish,
}: PublishDialogProps) {
  const [libraryId, setLibraryId] = useState<number | null>(null);
  const [mediaName, setMediaName] = useState('');

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 初始化表单
  useState(() => {
    if (open && defaultTitle) {
      setMediaName(defaultTitle);
      setError(null);
      setSuccess(false);
    }
  });

  // 自动选择匹配的库
  useState(() => {
    if (open && libraries.length > 0) {
      const matchingLibrary = libraries.find(
        lib => lib.type === (mediaType === 'movie' ? 'Movie' : 'TVShow')
      );
      if (matchingLibrary) {
        setLibraryId(matchingLibrary.id);
      }
    }
  });

  const handlePublish = async () => {
    if (!libraryId || !mediaName) return;

    try {
      setPublishing(true);
      setError(null);

      const request: PublishRequest = {
        library_id: libraryId,
        media_name: mediaName,
      };

      await onPublish(request);
      setSuccess(true);

      // 1.5秒后关闭对话框
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const filteredLibraries = libraries.filter(
    lib => lib.type === (mediaType === 'movie' ? 'Movie' : 'TVShow')
  );

  return (
    <Dialog open={open} onClose={publishing ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {success ? '发布成功' : '发布到媒体库'}
      </DialogTitle>

      <DialogContent>
        {success ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="body1" color="success.main">
              媒体已成功发布到媒体库
            </Typography>
          </Box>
        ) : (
          <Box>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>选择媒体库</InputLabel>
              <Select
                value={libraryId || ''}
                label="选择媒体库"
                onChange={(e) => setLibraryId(e.target.value ? Number(e.target.value) : null)}
              >
                {filteredLibraries.length === 0 ? (
                  <MenuItem value="" disabled>
                    无匹配的媒体库
                  </MenuItem>
                ) : (
                  filteredLibraries.map((library) => (
                    <MenuItem key={library.id} value={library.id}>
                      {library.name}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="媒体名称"
              value={mediaName}
              onChange={(e) => setMediaName(e.target.value)}
              helperText="格式：电影标题 (年份) 或 电视剧名称 (年份)"
              placeholder="例如：星际穿越 (2014)"
              sx={{ mb: 2 }}
            />

            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {success ? (
          <Button variant="contained">确定</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={publishing}>取消</Button>
            <Button
              onClick={handlePublish}
              variant="contained"
              disabled={!libraryId || !mediaName || publishing}
            >
              {publishing ? '发布中...' : '发布'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
