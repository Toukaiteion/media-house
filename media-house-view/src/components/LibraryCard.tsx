import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Fade,
  Skeleton,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Movie as MovieIcon,
  Tv as TvIcon,
} from '@mui/icons-material';
import { api } from '../services/api';
import type { MediaLibrary, MovieDetail, TVShow } from '../types';

interface LibraryCardProps {
  library: MediaLibrary;
  onEdit: (library: MediaLibrary) => void;
  onRefresh: (library: MediaLibrary) => void;
  onIncrementalScan?: (library: MediaLibrary) => void;
  onDelete: (library: MediaLibrary) => void;
}

export function LibraryCard({ library, onEdit, onRefresh, onIncrementalScan, onDelete }: LibraryCardProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [recentItems, setRecentItems] = useState<(MovieDetail | TVShow)[]>([]);
  const [loading, setLoading] = useState(true);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);

  useEffect(() => {
    const loadRecentItems = async () => {
      try {
        if (library.type === 'Movie') {
          const data = await api.getMoviesWithParams({
            libraryId: library.id,
            sortBy: 'create_time',
            sortOrder: 'desc',
            pageSize: 3,
          });
          setRecentItems(data.items);
        } else {
          // TVShow 类型，获取最近的 4 个电视剧
          const shows = await api.getTVShows(library.id);
          setRecentItems(shows.slice(0, 3));
        }
      } catch (err) {
        console.error('Failed to load recent items:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRecentItems();
  }, [library.id, library.type]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    handleMenuClose();
    onEdit(library);
  };

  const handleRefresh = () => {
    handleMenuClose();
    onRefresh(library);
  };

  const handleIncrementalScan = () => {
    handleMenuClose();
    onIncrementalScan?.(library);
  };

  const handleDelete = () => {
    handleMenuClose();
    onDelete(library);
  };

  const handleMouseEnter = () => {
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  const getTypeIcon = () => {
    return library.type === 'Movie' ? <MovieIcon /> : <TvIcon />;
  };

  // 渲染单个封面单元格
  const renderItemCell = (item: MovieDetail | TVShow | null, index: number) => {
    if (loading) {
      return (
        <Skeleton
          key={index}
          variant="rectangular"
          sx={{
            width: '100%',
            height: '100%',
            bgcolor: 'grey.800',
          }}
        />
      );
    }

    const posterPath = (item as MovieDetail)?.poster_path || (item as TVShow)?.posterPath;

    if (item && posterPath) {
      return (
        <Box
          key={index}
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <Box
            component="img"
            src={api.imageUrl(posterPath)}
            alt={(item as MovieDetail)?.title || (item as TVShow)?.title}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </Box>
      );
    }

    return (
      <Box
        key={index}
        sx={{
          width: '100%',
          height: '100%',
          bgcolor: 'grey.800',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          sx={{
            color: 'grey.600',
            opacity: hovered ? 0.3 : 0.5,
            transition: 'opacity 0.3s',
          }}
        >
          {getTypeIcon()}
        </Box>
      </Box>
    );
  };

  return (
    <Card
      sx={{
        width: 360,
        height: 320,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'visible',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 6,
        },
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 背景图片区域 - 2x2 网格拼图 */}
      <Box
        sx={{
          position: 'relative',
          width: 360,
          height: 220,
          display: 'flex',
          bgcolor: 'grey.800',
          overflow: 'hidden',
        }}
      >
        {renderItemCell(recentItems[0] || null, 0)}
        {renderItemCell(recentItems[1] || null, 1)}
        {renderItemCell(recentItems[2] || null, 2)}

        {/* 悬浮遮幕层 */}
        <Fade in={hovered}>
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(0, 0, 0, 0.4)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              gridRow: '1 / -1',
              gridColumn: '1 / -1',
            }}
          >
            <IconButton
              ref={menuButtonRef}
              onClick={handleMenuOpen}
              sx={{
                m: 1,
                bgcolor: 'rgba(255, 255, 255, 0.9)',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 1)',
                },
              }}
              aria-label="更多操作"
            >
              <MoreVertIcon />
            </IconButton>
          </Box>
        </Fade>
      </Box>

      {/* 库名称区域 */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
            {getTypeIcon()}
          </Box>
          <Typography variant="h6" noWrap sx={{ flex: 1 }}>
            {library.name}
          </Typography>
        </Box>

        {/* 状态标签 */}
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            bgcolor: library.status === 'Scanning' ? 'warning.dark' : 'text.disabled',
            color: 'white',
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        >
          {library.status}
        </Box>
      </Box>

      {/* 路径信息 */}
      <Box sx={{ px: 2, pb: 2 }}>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: '0.875rem' }}>
          {library.path}
        </Typography>
      </Box>

      {/* 弹出菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        TransitionComponent={Fade}
        sx={{ mt: 1, zIndex: 9999 }}
      >
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>修改</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleRefresh}>
          <ListItemIcon>
            <RefreshIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>全量扫描</ListItemText>
        </MenuItem>
        {onIncrementalScan && (
          <MenuItem onClick={handleIncrementalScan}>
            <ListItemIcon>
              <RefreshIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>增量扫描</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>删除</ListItemText>
        </MenuItem>
      </Menu>
    </Card>
  );
}
