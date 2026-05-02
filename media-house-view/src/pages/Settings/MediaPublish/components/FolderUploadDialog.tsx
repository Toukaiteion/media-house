import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  List,
  ListItem,
  ListItemText,
  IconButton,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

export interface FileNode {
  file: File;
  relativePath: string;
}

interface FolderUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onStartUpload: (files: FileNode[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FolderUploadDialog({ open, onClose, onStartUpload }: FolderUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileNode[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 统计
  const stats = selectedFiles.reduce((acc, f) => ({
    total: acc.total + 1,
    totalSize: acc.totalSize + f.file.size,
  }), { total: 0, totalSize: 0 });

  // 读取文件夹条目（递归）
  const readEntry = (entry: FileSystemEntry, path = ''): Promise<FileNode[]> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file((file: File) => {
          resolve([{ file, relativePath: path + file.name }]);
        });
      } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader();
        const allFiles: FileNode[] = [];

        // 读取所有条目（可能需要多次调用）
        const readAllEntries = () => {
          dirReader.readEntries((entries: FileSystemEntry[]) => {
            if (entries.length === 0) {
              resolve(allFiles);
              return;
            }

            // 并行处理所有子条目
            const promises = entries.map((childEntry) =>
              readEntry(childEntry, path + entry.name + '/')
            );

            Promise.all(promises).then((results) => {
              results.flat().forEach(f => allFiles.push(f));
              readAllEntries(); // 继续读取剩余条目
            });
          });
        };

        readAllEntries();
      } else {
        resolve([]);
      }
    });
  };

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const dataTransfer = e.dataTransfer;
    if (!dataTransfer) return;

    const items = dataTransfer.items;
    if (!items || items.length === 0) return;

    try {
      const allFiles: FileNode[] = [];

      // 处理每个拖拽的条目
      const processItem = async (item: DataTransferItem): Promise<void> => {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          const files = await readEntry(entry);
          files.forEach(f => allFiles.push(f));
        }
      };

      // 并行处理所有条目
      const promises = Array.from(items).map(item => processItem(item));
      await Promise.all(promises);

      if (allFiles.length > 0) {
        setSelectedFiles(allFiles);
      }
    } catch (error) {
      console.error('Error reading dropped files:', error);
    }
  }, []);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileNodes: FileNode[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = (file as any).webkitRelativePath || file.name;
        fileNodes.push({ file, relativePath });
      }
      setSelectedFiles(fileNodes);
    }
  };

  const handleStartUpload = () => {
    if (selectedFiles.length === 0) return;
    onStartUpload(selectedFiles);
    handleClose();
  };

  const handleClose = () => {
    onClose();
    setSelectedFiles([]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // 绑定拖拽事件
  const bindDragEvents = useCallback(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
  }, [handleDragOver, handleDragLeave, handleDrop]);

  // 解绑拖拽事件
  const unbindDragEvents = useCallback(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    dropZone.removeEventListener('dragover', handleDragOver);
    dropZone.removeEventListener('dragleave', handleDragLeave);
    dropZone.removeEventListener('drop', handleDrop);
  }, [handleDragOver, handleDragLeave, handleDrop]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        transition: {
          onEntered: bindDragEvents,
          onExiting: unbindDragEvents,
        },
      }}
    >
      <DialogTitle>上传文件夹</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          支持拖拽整个文件夹上传，将保持原始目录结构。
        </Alert>

        <input
          ref={inputRef}
          type="file"
          {...({ webkitdirectory: '' } as any)}
          {...({ directory: '' } as any)}
          onChange={handleFolderSelect}
          style={{ display: 'none' }}
        />

        <Box
          ref={dropZoneRef}
          onClick={() => inputRef.current?.click()}
          sx={{
            border: isDragging ? '2px solid' : '2px dashed',
            borderColor: isDragging ? 'primary.main' : 'divider',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: isDragging ? 'action.hover' : 'background.paper',
            transition: 'all 0.2s ease',
            minHeight: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
            },
          }}
        >
          <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="subtitle1" gutterBottom>
            {isDragging ? '释放鼠标以上传' : '拖拽文件夹到此处'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            或点击选择文件夹
          </Typography>
        </Box>

        {selectedFiles.length > 0 && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Typography variant="subtitle2">
                已选择 {stats.total} 个文件，总计 {formatFileSize(stats.totalSize)}
              </Typography>
              <IconButton onClick={handleClearFiles} size="small">
                <DeleteIcon />
              </IconButton>
            </Box>

            <Box sx={{ mt: 2, maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <List dense>
                {selectedFiles.slice(0, 100).map((f, i) => (
                  <ListItem key={i} sx={{ pl: 1 }}>
                    <ListItemText
                      primary={f.relativePath}
                      secondary={formatFileSize(f.file.size)}
                      slotProps={{
                        primary: {
                          fontSize: '0.875rem',
                        },
                        secondary: {
                          fontSize: '0.75rem',
                        },
                      }}
                    />
                  </ListItem>
                ))}
                {selectedFiles.length > 100 && (
                  <ListItem sx={{ pl: 1 }}>
                    <ListItemText
                      primary={`... 还有 ${selectedFiles.length - 100} 个文件`}
                      slotProps={{
                        secondary: {
                          fontSize: '0.75rem',  
                        }
                      }}
                    />
                  </ListItem>
                )}
              </List>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>取消</Button>
        <Button onClick={handleStartUpload} variant="contained" disabled={selectedFiles.length === 0}>
          开始上传
        </Button>
      </DialogActions>
    </Dialog>
  );
}
