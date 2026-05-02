import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Folder as FolderIcon,
  Description as FileIcon,
  Image as ImageIcon,
} from '@mui/icons-material';

interface FileNode {
  file: File;
  path: string;
  include: boolean;
  reason?: string;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.ts', '.m2ts', '.mpeg', '.mpg', '.m4v'
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function shouldIgnoreFile(name: string, size: number): { ignore: boolean; reason?: string } {
  const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return { ignore: true, reason: '视频文件' };
  }
  if (size > MAX_FILE_SIZE) {
    return { ignore: true, reason: `文件过大（${formatFileSize(size)})` };
  }
  return { ignore: false };
}

function getFileIcon(name: string) {
  const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
    return <ImageIcon fontSize="small" sx={{ color: '#4caf50' }} />;
  }
  if (ext === '.nfo') {
    return <FileIcon fontSize="small" sx={{ color: '#ff9800' }} />;
  }
  return <FileIcon fontSize="small" />;
}

interface FolderUploadTabProps {
  mediaTitle: string;
  folderFiles: FileNode[];
  onFolderSelect: (files: FileNode[]) => void;
  onClearFiles: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function FolderUploadTab({
  mediaTitle,
  folderFiles,
  onFolderSelect,
  onClearFiles,
  inputRef
}: FolderUploadTabProps) {
  const [isDragging, setIsDragging] = useState(false);

  // 统计
  const stats = folderFiles.reduce((acc, f) => {
    acc.total += 1;
    if (f.include) {
      acc.included += 1;
      acc.includedSize += f.file.size;
    }
    return acc;
  }, { total: 0, included: 0, includedSize: 0 });

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

  const items = Array.from(e.dataTransfer?.items || []);

  // 辅助函数：递归读取文件夹内的文件
  const readEntry = (entry: any, path = ''): Promise<FileNode[]> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          const check = shouldIgnoreFile(file.name, file.size);
          // 拼接完整的相对路径
          const fullPath = path + file.name; 
          resolve([{
            file,
            path: fullPath,
            include: !check.ignore,
            reason: check.reason,
          }]);
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        // readEntries 可能需要多次调用才能读完所有子项
        const readAllEntries = () => {
          dirReader.readEntries(async (entries: any[]) => {
            if (entries.length === 0) {
              resolve([]);
              return;
            }
            const promises = entries.map((childEntry) => 
              readEntry(childEntry, path + entry.name + '/')
            );
            const results = await Promise.all(promises);
            // 继续读取（防止文件夹内文件过多一次读不完）
            readAllEntries(); 
            resolve(results.flat());
          });
        };
        readAllEntries();
      } else {
        resolve([]);
      }
    });
  };

  // 遍历拖拽的所有项
  const promises = items.map(async (item) => {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      return await readEntry(entry);
    }
    return [];
  });

  // 等待所有文件和文件夹读取完成
  const results = await Promise.all(promises);
  const allFileNodes = results.flat();

  if (allFileNodes.length > 0) {
    onFolderSelect(allFileNodes);
  }
}, [onFolderSelect]);

  useEffect(() => {
    const dropZone = inputRef.current?.closest('[role="dropzone"]') as HTMLElement;
    if (dropZone) {
      dropZone.addEventListener('dragover', handleDragOver);
      dropZone.addEventListener('dragleave', handleDragLeave);
      dropZone.addEventListener('drop', handleDrop);
    }
    return () => {
      if (dropZone) {
        dropZone.removeEventListener('dragover', handleDragOver);
        dropZone.removeEventListener('dragleave', handleDragLeave);
        dropZone.removeEventListener('drop', handleDrop);
      }
    };
  }, [handleDragOver, handleDragLeave, handleDrop]);

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        选择包含电影元数据的文件夹，将自动过滤并压缩2MB以下的文件到"{mediaTitle}"
      </Typography>

      <Box
        role="dropzone"
        sx={{
          border: isDragging ? '2px solid' : '2px dashed',
          borderColor: isDragging ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: isDragging ? 'action.hover' : 'background.paper',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'action.hover',
          },
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              const fileNodes: FileNode[] = [];
              for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const check = shouldIgnoreFile(file.name, file.size);
                // 获取相对路径：优先使用 webkitRelativePath
                const relativePath = (file as any).webkitRelativePath || file.name;
                fileNodes.push({
                  file,
                  path: relativePath,
                  include: !check.ignore,
                  reason: check.reason,
                });
              }
              onFolderSelect(fileNodes);
            }
          }}
          style={{ display: 'none' }}
          {...({} as any)}
        />
        {folderFiles.length === 0 ? (
          <Box>
            <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="subtitle1">点击选择文件夹</Typography>
            <Typography variant="body2" color="text.secondary">
              或拖放文件到此处（注意：拖放文件夹需点击选择）
            </Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%' }}>
            <FolderIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="subtitle1" gutterBottom>
              已选择文件夹
            </Typography>
            <Typography variant="body2" color="text.secondary">
              共扫描 {stats.total} 个文件，将压缩 {stats.included} 个文件
            </Typography>
          </Box>
        )}
      </Box>

      {/* 文件结构展示 */}
      {folderFiles.length > 0 && (
        <>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
            <Typography variant="subtitle2" gutterBottom>
              将要压缩上传的文件：
            </Typography>
            <List dense disablePadding>
              {folderFiles.slice(0, 100).map((f, i) => (
                <ListItem
                  key={i}
                  sx={{
                    pl: 1,
                    opacity: f.include ? 1 : 0.5,
                    textDecoration: f.include ? 'none' : 'line-through',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {getFileIcon(f.file.name)}
                  </ListItemIcon>
                  <ListItemText
                    primary={f.path}
                    secondary={
                      f.include
                        ? formatFileSize(f.file.size)
                        : `已忽略: ${f.reason}`
                    }
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontSize: '0.875rem',
                    }}
                    secondaryTypographyProps={{
                      variant: 'caption',
                      fontSize: '0.75rem',
                      color: f.include ? 'text.secondary' : 'error',
                    }}
                  />
                </ListItem>
              ))}
              {folderFiles.length > 100 && (
                <ListItem sx={{ pl: 1 }}>
                  <ListItemText
                    primary={`... 还有 ${folderFiles.length - 100} 个文件`}
                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                  />
                </ListItem>
              )}
            </List>
          </Box>

          {/* 统计信息 */}
          <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              共扫描: {stats.total} 个文件
            </Typography>
            <Typography variant="body2" color="success.main">
              将压缩: {stats.included} 个文件 ({formatFileSize(stats.includedSize)})
            </Typography>
            {stats.total - stats.included > 0 && (
              <Typography variant="body2" color="text.secondary">
                忽略: {stats.total - stats.included} 个文件
              </Typography>
            )}
          </Box>

          {/* 提示信息 */}
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              将只压缩2MB以下的非视频文件。视频文件（mp4, mkv, avi, mov等）和大于2MB的文件将被忽略。
            </Typography>
          </Alert>

          {/* 清除按钮 */}
          {folderFiles.length > 0 && (
            <Button
              variant="outlined"
              onClick={onClearFiles}
              sx={{ mt: 2 }}
            >
              重新选择
            </Button>
          )}
        </>
      )}
    </>
  );
}
