import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  FolderZip as ZipIcon,
  Folder as FolderIcon,
  Description as FileIcon,
  Image as ImageIcon,
} from '@mui/icons-material';

interface ZipUploadTabProps {
  mediaTitle: string;
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function ZipUploadTab({ mediaTitle, selectedFile, onFileSelect, inputRef }: ZipUploadTabProps) {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        上传包含电影元数据的zip文件到"{mediaTitle}"
      </Typography>

      <Box
        sx={{
          border: '2px dashed',
          borderColor: 'divider',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'action.hover',
          },
        }}
        onClick={() => inputRef?.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {selectedFile ? (
          <Box>
            <ZipIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="subtitle1" gutterBottom>
              {selectedFile.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </Typography>
          </Box>
        ) : (
          <Box>
            <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="subtitle1">点击选择zip文件</Typography>
            <Typography variant="body2" color="text.secondary">
              支持上传包含元数据的zip压缩包
            </Typography>
          </Box>
        )}
      </Box>

      {/* 静态结构说明 */}
      <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Zip文件应包含的结构：
        </Typography>
        <List dense>
          <ListItem>
            <ListItemIcon>
              <FileIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="movie.nfo - 电影信息文件" />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <ImageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="poster.jpg - 海报图片" />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <ImageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="fanart.jpg - 背景图片" />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <FolderIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="extrathumbs/ - 截图目录" />
          </ListItem>
          <ListItem sx={{ pl: 4 }}>
            <ListItemIcon>
              <ImageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="thumb1.jpg, thumb2.jpg, ..." />
          </ListItem>
        </List>
      </Box>
    </>
  );
}
