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
  Stack,
  IconButton,
  Card,
  CardMedia,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Close as CloseIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import type { StagingMedia, UpdateStagingMetadataDto } from '../types';
import { api } from '../services/api';

interface MediaEditDialogProps {
  open: boolean;
  media: StagingMedia | null;
  onClose: () => void;
  onSave: () => void;
  onScrape: () => void;
}

export function MediaEditDialog({ open, media, onClose, onSave, onScrape }: MediaEditDialogProps) {
  // 表单状态
  const [formData, setFormData] = useState<UpdateStagingMetadataDto>({
    title: '',
    original_title: '',
    year: undefined,
    studio: '',
    runtime: undefined,
    description: '',
  });

  // 图片上传状态
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [uploadingFanart, setUploadingFanart] = useState(false);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);

  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [fanartPreview, setFanartPreview] = useState<string | null>(null);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 重置表单
  useState(() => {
    if (open && media) {
      setFormData({
        title: media.title || '',
        original_title: media.original_title || '',
        year: media.year,
        studio: media.studio || '',
        runtime: media.runtime,
        description: media.description || '',
      });
      setError(null);
    }
  });

  const handleSave = async () => {
    if (!media) return;

    try {
      setLoading(true);
      setError(null);

      await api.updateStagingMetadata(media.id, formData);
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePosterChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !media) return;

    try {
      setUploadingPoster(true);
      setError(null);

      // 本地预览
      const reader = new FileReader();
      reader.onload = (event) => {
        setPosterPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);

      await api.uploadStagingPoster(media.id, file);
      onSave(); // 刷新媒体列表
    } catch (err) {
      setError(err instanceof Error ? err.message : '海报上传失败');
    } finally {
      setUploadingPoster(false);
    }
  };

  const handleFanartChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !media) return;

    try {
      setUploadingFanart(true);
      setError(null);

      const reader = new FileReader();
      reader.onload = (event) => {
        setFanartPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);

      await api.uploadStagingFanart(media.id, file);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : '背景图上传失败');
    } finally {
      setUploadingFanart(false);
    }
  };

  const handleScreenshotChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !media) return;

    try {
      setUploadingScreenshot(true);
      setError(null);

      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshotPreviews((prev) => [...prev, event.target?.result as string]);
      };
      reader.readAsDataURL(file);

      await api.uploadStagingScreenshot(media.id, file);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : '截图上传失败');
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const renderImageUpload = (
    label: string,
    currentPath: string | undefined,
    preview: string | null,
    uploading: boolean,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    multiple = false
  ) => (
    <Box>
      <Typography variant="subtitle2" gutterBottom>{label}</Typography>
      <Card sx={{ position: 'relative', height: 150, bgcolor: 'grey.800' }}>
        {(preview || currentPath) ? (
          <CardMedia
            component="img"
            image={preview || (currentPath ? api.imageUrl(currentPath) : '')}
            sx={{ height: 150, objectFit: 'cover' }}
          />
        ) : (
          <Box
            sx={{
              height: 150,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'grey.500',
            }}
          >
            <UploadIcon sx={{ fontSize: 40 }} />
            <Typography variant="body2" sx={{ ml: 1 }}>
              暂无图片
            </Typography>
          </Box>
        )}

        {uploading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LinearProgress sx={{ width: '80%' }} />
          </Box>
        )}

        <IconButton
          component="label"
          sx={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            bgcolor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            '&:hover': {
              bgcolor: 'rgba(0, 0, 0, 0.8)',
            },
          }}
        >
          <UploadIcon />
          <input
            type="file"
            accept="image/*"
            onChange={onChange}
            style={{ display: 'none' }}
            multiple={multiple}
          />
        </IconButton>
      </Card>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">编辑媒体元数据</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<SearchIcon />}
              onClick={onScrape}
              size="small"
            >
              搜刮元数据
            </Button>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', gap: 3 }}>
          {/* 左侧：基本信息 */}
          <Box sx={{ flex: 1 }}>
            <TextField
              fullWidth
              label="标题"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="原始标题"
              value={formData.original_title}
              onChange={(e) => setFormData({ ...formData, original_title: e.target.value })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="年份"
              type="number"
              value={formData.year || ''}
              onChange={(e) => setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="制片厂"
              value={formData.studio}
              onChange={(e) => setFormData({ ...formData, studio: e.target.value })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="时长（分钟）"
              type="number"
              value={formData.runtime || ''}
              onChange={(e) => setFormData({ ...formData, runtime: e.target.value ? parseInt(e.target.value) : undefined })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="描述"
              multiline
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </Box>

          {/* 右侧：图片上传 */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" gutterBottom>图片</Typography>
            <Stack spacing={2}>
              {renderImageUpload(
                '海报',
                media?.poster_path,
                posterPreview,
                uploadingPoster,
                handlePosterChange
              )}

              {renderImageUpload(
                '背景图',
                media?.fanart_path,
                fanartPreview,
                uploadingFanart,
                handleFanartChange
              )}

              <Box>
                <Typography variant="subtitle2" gutterBottom>截图</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {media?.screenshots_path && media.screenshots_path.split(',').map((path, idx) => (
                    <Card key={idx} sx={{ width: 120, height: 80 }}>
                      <CardMedia
                        component="img"
                        image={api.imageUrl(path.trim())}
                        sx={{ height: 80, objectFit: 'cover' }}
                      />
                    </Card>
                  ))}
                  {screenshotPreviews.map((preview, idx) => (
                    <Card key={`new-${idx}`} sx={{ width: 120, height: 80 }}>
                      <CardMedia
                        component="img"
                        image={preview}
                        sx={{ height: 80, objectFit: 'cover' }}
                      />
                    </Card>
                  ))}
                  {uploadingScreenshot && (
                    <Box sx={{ width: 120, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <LinearProgress sx={{ width: '80%' }} />
                    </Box>
                  )}
                  <IconButton
                    component="label"
                    sx={{
                      width: 120,
                      height: 80,
                      bgcolor: 'grey.800',
                      '&:hover': {
                        bgcolor: 'grey.700',
                      },
                    }}
                  >
                    <UploadIcon />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleScreenshotChange}
                      style={{ display: 'none' }}
                    />
                  </IconButton>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}>
          {loading ? '保存中...' : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
