import { Card, CardContent, Typography, Box, IconButton, LinearProgress, Chip } from '@mui/material';
import {
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import type { UploadTask } from '../types';

interface UploadTaskCardProps {
  task: UploadTask;
  speed?: number;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  uploading: '上传中',
  paused: '已暂停',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败',
};

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  pending: 'default',
  uploading: 'primary',
  paused: 'warning',
  completed: 'success',
  cancelled: 'default',
  failed: 'error',
};

export function UploadTaskCard({ task, speed, onPause, onResume, onDelete }: UploadTaskCardProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0 || !isFinite(bytesPerSecond)) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return `${(bytesPerSecond / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const progress = task.file_size > 0 ? (task.uploaded_size / task.file_size) * 100 : 0;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
          <Typography variant="h6" noWrap sx={{ flex: 1, mr: 1 }}>
            {task.file_name}
          </Typography>
          <Chip
            label={STATUS_LABELS[task.status]}
            color={STATUS_COLORS[task.status]}
            size="small"
          />
        </Box>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {formatFileSize(task.uploaded_size)} / {formatFileSize(task.file_size)}
          </Typography>
        </Box>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            分片: {task.uploaded_chunks} / {task.total_chunks}
          </Typography>
        </Box>

        <Box sx={{ mt: 2 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 8, borderRadius: 4 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {progress.toFixed(1)}%
            </Typography>
            {speed !== undefined && task.status === 'uploading' && (
              <Typography variant="caption" color="text.secondary">
                {formatSpeed(speed)}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>

      <Box sx={{ p: 2, pt: 0, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        {task.status === 'uploading' && (
          <IconButton
            onClick={() => onPause(task.upload_id)}
            aria-label="暂停"
            title="暂停"
            size="small"
          >
            <PauseIcon />
          </IconButton>
        )}
        {task.status === 'paused' && (
          <IconButton
            onClick={() => onResume(task.upload_id)}
            aria-label="恢复"
            title="恢复"
            size="small"
          >
            <ResumeIcon />
          </IconButton>
        )}
        {(task.status === 'pending' || task.status === 'paused' || task.status === 'failed') && (
          <IconButton
            onClick={() => onDelete(task.upload_id)}
            aria-label="删除"
            title="删除"
            size="small"
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        )}
      </Box>
    </Card>
  );
}
