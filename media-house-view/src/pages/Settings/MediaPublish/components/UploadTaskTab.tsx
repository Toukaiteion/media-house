import { useState } from 'react';
import { Box, Grid, Typography, Tabs, Tab } from '@mui/material';
import { UploadTaskCard } from './UploadTaskCard';
import { FolderUploadTaskCard } from './FolderUploadTaskCard';
import type { UploadTask, FolderUploadTask } from '../../../../types';

interface UploadTaskTabProps {
  tasks: UploadTask[];
  folderTasks: FolderUploadTask[];
  uploadSpeeds: Map<string, number>;
  folderUploadSpeeds: Map<string, number>;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onDeleteUpload: (taskId: string) => void;
  onDeleteFolder: (folderId: string) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ mt: 2 }}>{children}</Box>}
    </div>
  );
}

export function UploadTaskTab({
  tasks,
  folderTasks,
  uploadSpeeds,
  folderUploadSpeeds,
  onPause,
  onResume,
  onDeleteUpload,
  onDeleteFolder,
}: UploadTaskTabProps) {
  const [uploadTabValue, setUploadTabValue] = useState(0);

  const hasUploadTasks = tasks.length > 0;
  const hasFolderTasks = folderTasks.length > 0;
  const hasNoTasks = !hasUploadTasks && !hasFolderTasks;

  if (hasNoTasks) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">
          暂无上传任务
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          切换到"待发布媒体"标签页上传新媒体
        </Typography>
      </Box>
    );
  }

  return (
    <>
      {(hasUploadTasks && hasFolderTasks) && (
        <Tabs value={uploadTabValue} onChange={(_, v) => setUploadTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`单文件上传 (${tasks.length})`} />
          <Tab label={`文件夹上传 (${folderTasks.length})`} />
        </Tabs>
      )}

      <TabPanel value={uploadTabValue} index={0}>
        {hasUploadTasks && (
          <Grid container spacing={3}>
            {tasks.map((task) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={task.upload_id}>
                <UploadTaskCard
                  task={task}
                  speed={uploadSpeeds.get(task.upload_id)}
                  onPause={onPause}
                  onResume={onResume}
                  onDelete={onDeleteUpload}
                />
              </Grid>
            ))}
          </Grid>
        )}
        {!hasUploadTasks && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            暂无单文件上传任务
          </Typography>
        )}
      </TabPanel>

      <TabPanel value={uploadTabValue} index={hasUploadTasks ? 1 : 0}>
        {hasFolderTasks && (
          <Grid container spacing={3}>
            {folderTasks.map((task) => (
              <Grid size={{ xs: 12, sm: 12, md: 12, lg: 12 }} key={task.folder_id}>
                <FolderUploadTaskCard
                  task={task}
                  speed={folderUploadSpeeds.get(task.folder_id)}
                  onDelete={onDeleteFolder}
                />
              </Grid>
            ))}
          </Grid>
        )}
        {!hasFolderTasks && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            暂无文件夹上传任务
          </Typography>
        )}
      </TabPanel>
    </>
  );
}
