import { Box, Grid, Typography } from '@mui/material';
import { UploadTaskCard } from './UploadTaskCard';
import type { UploadTask } from '../../../../types';

interface UploadTaskTabProps {
  tasks: UploadTask[];
  uploadSpeeds: Map<string, number>;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

export function UploadTaskTab({
  tasks,
  uploadSpeeds,
  onPause,
  onResume,
  onDelete,
}: UploadTaskTabProps) {

  return (
    <>
      {tasks.length === 0 ? (
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
          {tasks.map((task) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={task.upload_id}>
              <UploadTaskCard
                task={task}
                speed={uploadSpeeds.get(task.upload_id)}
                onPause={onPause}
                onResume={onResume}
                onDelete={onDelete}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}
