import { useState } from 'react';
import { Card, CardContent, Typography, Box, IconButton, LinearProgress, Chip, Collapse, Button } from '@mui/material';
import {
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import type { FolderUploadTask } from '../../../../types';

interface FolderUploadTaskCardProps {
  task: FolderUploadTask;
  speed?: number;
  onDelete: (folderId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  uploading: '上传中',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败',
};

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info'> = {
  pending: 'default',
  uploading: 'primary',
  completed: 'success',
  cancelled: 'default',
  failed: 'error',
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0 || !isFinite(bytesPerSecond)) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return `${(bytesPerSecond / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function FolderUploadTaskCard({ task, speed, onDelete }: FolderUploadTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

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
            {task.folder_name}
          </Typography>
          <Chip
            label={STATUS_LABELS[task.status]}
            color={STATUS_COLORS[task.status]}
            size="small"
          />
        </Box>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {formatFileSize(task.uploaded_size)} / {formatFileSize(task.total_size)}
          </Typography>
        </Box>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            文件: {task.completed_files} / {task.total_files}
          </Typography>
        </Box>

        <Box sx={{ mt: 2 }}>
          <LinearProgress
            variant="determinate"
            value={task.progress * 100}
            sx={{ height: 8, borderRadius: 4 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {(task.progress * 100).toFixed(1)}%
            </Typography>
            {speed !== undefined && task.status === 'uploading' && (
              <Typography variant="caption" color="text.secondary">
                {formatSpeed(speed)}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>

      <Box sx={{ p: 2, pt: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={() => setExpanded(!expanded)}
          size="small"
          disabled={task.files.length === 0}
        >
          文件列表 ({task.files.length})
        </Button>
        <IconButton
          onClick={() => onDelete(task.folder_id)}
          aria-label="删除"
          title="删除"
          size="small"
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, maxHeight: 200, overflow: 'auto' }}>
          {task.files.map((file, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 0.5,
                fontSize: '0.875rem',
              }}
            >
              <Typography noWrap sx={{ flex: 1, mr: 1 }}>
                {file.relative_path || file.file_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {(file.progress * 100).toFixed(0)}%
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Card>
  );
}
