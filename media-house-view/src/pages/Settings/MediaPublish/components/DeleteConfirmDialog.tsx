import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import type { StagingMedia } from '../../../../types';

interface DeleteConfirmDialogProps {
  open: boolean;
  media: StagingMedia | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ open, media, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs">
      <DialogTitle>确认删除</DialogTitle>
      <DialogContent>
        <Typography>
          确定要删除媒体 "{media?.title}" 吗？此操作不可撤销，将删除所有相关文件。
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          删除
        </Button>
      </DialogActions>
    </Dialog>
  );
}
