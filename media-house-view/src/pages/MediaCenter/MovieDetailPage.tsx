import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Grid,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayArrow as PlayIcon, Delete as DeleteIcon, Favorite, FavoriteBorder } from '@mui/icons-material';
import { api } from '../../services/api';
import { movieListCache } from '../../services/movieListCache';
import type { MovieDetail } from '../../types';
import { ImageViewer } from '../../components/ImageViewer';

const POSTER_WIDTH = 300;

export function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const loadMovie = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const data = await api.getMovieDetail(id);
      setMovie(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovie();
  }, [id]);

  const handlePlay = () => {
    if (!id) return;
    movieListCache.setNavigationSource('play');
    navigate(`/play/${id}`);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;

    try {
      await api.deleteMovie(id);
      navigate('/media-center/movies');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index);
    setViewerOpen(true);
  };

  const handleViewerClose = () => {
    setViewerOpen(false);
  };

  const handleFavoriteToggle = async () => {
    if (!id) return;
    try {
      const response = await api.toggleFavorite(id, 1);
      setMovie((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          is_favorited: response.is_favorited,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '收藏切换失败');
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !movie) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!movie) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>电影不存在</Typography>
      </Box>
    );
  }

  const posterUrl = movie.poster_path ? api.imageUrl(movie.poster_path) : undefined;

  return (
    <Box sx={{ p: 3, width: '100%' }}>

      {/* 上部信息区 */}
      <Box sx={{ display: 'flex', gap: 4, mb: 4, flexWrap: 'wrap' }}>
        {/* 左侧：海报 */}
        <Box
          sx={{
            width: POSTER_WIDTH,
            aspectRatio: '2/3',
            bgcolor: 'grey.800',
            flexShrink: 0,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {posterUrl ? (
            <Box
              component="img"
              src={posterUrl}
              alt={movie.title}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'grey.600',
                fontSize: 64,
              }}
            >
              <PlayIcon sx={{ fontSize: 64 }} />
            </Box>
          )}
        </Box>

        {/* 右侧：详细信息 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* 标题 */}
          <Typography variant="h4" fontWeight={600} gutterBottom>
            {movie.title}
          </Typography>

          {/* 年份 */}
          {movie.year && (
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {movie.year}
            </Typography>
          )}

          {/* 描述 */}
          {movie.overview && (
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              {movie.overview}
            </Typography>
          )}

          {/* 标签列表 */}
          {movie.tags && movie.tags.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                标签
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {movie.tags.map((tag) => (
                  <Chip key={tag.id} label={tag.tag_name} size="small" />
                ))}
              </Box>
            </Box>
          )}

          {/* 演员列表 */}
          {movie.actors && movie.actors.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                演员
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {movie.actors.map((actor) => {
                  const avatarUrl = actor.avatar_path ? api.imageUrl(actor.avatar_path) : undefined;
                  return (
                    <Box
                      key={actor.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Avatar
                        src={avatarUrl}
                        alt={actor.name}
                        sx={{ width: 40, height: 40 }}
                      >
                        {actor.name.charAt(0)}
                      </Avatar>
                      <Typography variant="body2">
                        {actor.name}
                        {actor.role_name && (
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.secondary"
                            sx={{ ml: 0.5 }}
                          >
                            ({actor.role_name})
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* 导演列表 */}
          {movie.directors && movie.directors.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                导演
              </Typography>
              <Typography variant="body2">
                {movie.directors.map((dir) => dir.name).join(', ')}
              </Typography>
            </Box>
          )}

          {/* 编剧列表 */}
          {movie.writers && movie.writers.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle2" gutterBottom>
                编剧
              </Typography>
              <Typography variant="body2">
                {movie.writers.map((writer) => writer.name).join(', ')}
              </Typography>
            </Box>
          )}

          {/* 制片厂 */}
          {movie.studio && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle2" gutterBottom>
                制片厂
              </Typography>
              <Typography variant="body2">{movie.studio}</Typography>
            </Box>
          )}
          {/* 操作按钮区 */}
          <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayIcon />}
              onClick={handlePlay}
              size="large"
            >
              播放
            </Button>
            <Button
              variant="contained"
              color={movie.is_favorited ? 'error' : 'primary'}
              startIcon={movie.is_favorited ? <Favorite /> : <FavoriteBorder />}
              onClick={handleFavoriteToggle}
              size="large"
            >
              {movie.is_favorited ? '已收藏' : '收藏'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleDeleteClick}
              size="large"
            >
              删除
            </Button>
          </Box>
        </Box>
      </Box>

      

      {/* 截图列表 */}
      {movie.screenshots && movie.screenshots.length > 0 && (
        <Box>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            剧照
          </Typography>
          <Grid container spacing={2}>
            {movie.screenshots.map((screenshot, index) => {
              const screenshotUrl = api.imageUrl(screenshot.url_name);
              return (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={index}>
                  <Box
                    component="img"
                    src={screenshotUrl}
                    alt={screenshot.name}
                    onClick={() => handleImageClick(index)}
                    sx={{
                      width: '100%',
                      aspectRatio: '16/9',
                      objectFit: 'cover',
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        transform: 'scale(1.02)',
                        boxShadow: 4,
                      },
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                  />
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* 图片查看器 */}
      {movie.screenshots && movie.screenshots.length > 0 && (
        <ImageViewer
          images={movie.screenshots.map((s) => api.imageUrl(s.url_name))}
          initialIndex={currentImageIndex}
          open={viewerOpen}
          onClose={handleViewerClose}
        />
      )}

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除电影"{movie.title}"吗？此操作不可撤销。
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>取消</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
