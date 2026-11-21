import { Snackbar } from '@mui/material';

interface ToastProps {
  /** 传 null 表示不显示 */
  message: string | null;
  onClose: () => void;
}

/**
 * 轻量操作反馈：收藏/关注成功后在底部弹一条 1.6 秒的提示，
 * 避免用户不确定「到底点上没有」。
 */
export function Toast({ message, onClose }: ToastProps) {
  return (
    <Snackbar
      open={Boolean(message)}
      autoHideDuration={1600}
      onClose={onClose}
      message={message ?? ''}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
  );
}
