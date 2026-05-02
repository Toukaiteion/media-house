import { Box, Typography, IconButton, Button } from '@mui/material';
import { Refresh as RefreshIcon, CloudUpload as UploadIcon, FolderOpen as FolderUploadIcon } from '@mui/icons-material';

interface MediaPublishHeaderProps {
  tabValue: number;
  onRefresh: () => void;
  onOpenUploadDialog: () => void;
  onOpenFolderUploadDialog: () => void;
}

export function MediaPublishHeader({ tabValue, onRefresh, onOpenUploadDialog, onOpenFolderUploadDialog }: MediaPublishHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 3,
      }}
    >
      <Typography variant="h4">媒体发布</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <IconButton onClick={onRefresh} aria-label="刷新">
          <RefreshIcon />
        </IconButton>
        {tabValue === 0 && (
          <>
            <Button variant="outlined" startIcon={<FolderUploadIcon />} onClick={onOpenFolderUploadDialog}>
              上传文件夹
            </Button>
            <Button variant="contained" startIcon={<UploadIcon />} onClick={onOpenUploadDialog}>
              上传媒体
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
