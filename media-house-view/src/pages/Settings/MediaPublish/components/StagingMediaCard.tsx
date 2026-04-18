import { Card, CardContent, Box, Typography, Chip, IconButton } from '@mui/material';
import {
  Edit as EditIcon,
  Publish as PublishIcon,
  Delete as DeleteIcon,
  Movie as MovieIcon,
  Tv as TvIcon,
} from '@mui/icons-material';
import type { StagingMedia } from '../../../../types';
import { api } from '../../../../services/api';

interface StagingMediaCardProps {
  media: StagingMedia;
  onEdit: (media: StagingMedia) => void;
  onPublish: (media: StagingMedia) => void;
  onDelete: (mediaId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending_edit: '待编辑',
  pending_publish: '待发布',
  published: '已发布',
};

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success'> = {
  pending_edit: 'default',
  pending_publish: 'primary',
  published: 'success',
};

export function StagingMediaCard({ media, onEdit, onPublish, onDelete }: StagingMediaCardProps) {
  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '未知';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* 海报区域 */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          pt: '150%', // 2:3 纵横比
          bgcolor: 'grey.800',
        }}
      >
        {media.poster_path ? (
          <Box
            component="img"
            src={api.imageUrl(media.poster_path)}
            alt={media.title || '媒体海报'}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box sx={{ fontSize: 80, color: 'grey.600' }}>
              {media.type === 'movie' ? <MovieIcon sx={{ fontSize: 'inherit' }} /> : <TvIcon sx={{ fontSize: 'inherit' }} />}
            </Box>
          </Box>
        )}

        {/* 状态标签 */}
        <Chip
          label={STATUS_LABELS[media.status]}
          color={STATUS_COLORS[media.status]}
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
          }}
        />
      </Box>

      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" noWrap sx={{ mb: 1 }}>
          {media.title || '未命名'}
        </Typography>

        {media.year && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            年份: {media.year}
          </Typography>
        )}

        {media.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: 1,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {media.description}
          </Typography>
        )}

        <Box sx={{ mt: 'auto' }}>
          <Typography variant="caption" color="text.secondary">
            大小: {formatFileSize(media.video_size)}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            创建时间: {formatDate(media.created_at)}
          </Typography>
        </Box>
      </CardContent>

      {/* 操作按钮 */}
      <Box sx={{ p: 1, pt: 0, display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
        <IconButton
          onClick={() => onEdit(media)}
          aria-label="编辑"
          title="编辑"
          size="small"
        >
          <EditIcon />
        </IconButton>
        {media.status !== 'published' && (
          <IconButton
            onClick={() => onPublish(media)}
            aria-label="发布"
            title="发布"
            size="small"
            color="primary"
          >
            <PublishIcon />
          </IconButton>
        )}
        <IconButton
          onClick={() => onDelete(media.id)}
          aria-label="删除"
          title="删除"
          size="small"
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </Box>
    </Card>
  );
}
