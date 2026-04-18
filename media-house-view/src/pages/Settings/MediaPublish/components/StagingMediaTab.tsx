import { Box, Grid, Typography, Button, Alert, CircularProgress } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { StagingMediaCard } from './StagingMediaCard';
import type { StagingMedia } from '../../../../types';

interface StagingMediaTabProps {
  medias: StagingMedia[];
  loading: boolean;
  error: string | null;
  onEdit: (media: StagingMedia) => void;
  onPublish: (media: StagingMedia) => void;
  onDelete: (media: StagingMedia) => void;
  onOpenUploadDialog: () => void;
}

export function StagingMediaTab({
  medias,
  loading,
  error,
  onEdit,
  onPublish,
  onDelete,
  onOpenUploadDialog,
}: StagingMediaTabProps) {
  return (
    <>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : medias.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            暂无待发布媒体
          </Typography>
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={onOpenUploadDialog}
            sx={{ mt: 2 }}
          >
            上传新媒体
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {medias.map((media) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={media.id}>
              <StagingMediaCard
                media={media}
                onEdit={onEdit}
                onPublish={onPublish}
                onDelete={() => onDelete(media)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => {}}>
          {error}
        </Alert>
      )}
    </>
  );
}
