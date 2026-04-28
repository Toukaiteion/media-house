import { useState } from 'react';
import { Box, Card, Typography, IconButton, Fade, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { PlayArrow as PlayIcon, Favorite, FavoriteBorder } from '@mui/icons-material';
import { api } from '../services/api';

interface MovieCardProps {
  media_id: number;
  poster_url?: string;
  title: string;
  year?: number;
  is_favorited?: boolean;
  onFavoriteToggle?: () => void;
}

export function MovieCard({ media_id, poster_url, title, year, is_favorited, onFavoriteToggle }: MovieCardProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  const posterUrl = poster_url ? api.imageUrl(poster_url) : undefined;

  const handlePosterClick = () => {
    navigate(`/play/${media_id}`);
  };

  const handleTitleClick = () => {
    navigate(`/media-center/movies/${media_id}`);
  };

  return (
    <Card
      sx={{
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 2,
        transition: 'box-shadow 0.3s ease-in-out',
        '&:hover': {
          boxShadow: 8,
        },
      }}
    >
      {/* 海报图片区域 */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: 'auto',
          aspectRatio: 0.743,
          bgcolor: 'grey.800',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleTitleClick}
      >
        {/* 海报图片 */}
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s ease-in-out',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
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
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                handlePosterClick();
              }}
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)',
                width: 64,
                height: 64,
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 1)',
                  transform: 'scale(1.1)',
                },
                transition: 'transform 0.2s',
              }}
              aria-label="播放"
            >
              <PlayIcon sx={{ fontSize: 36, color: theme.palette.mode === 'dark' ? 'white' : 'text.primary' }} />
            </IconButton>
          </Box>
        </Fade>

        {/* 收藏按钮 - 右下角 */}
        {onFavoriteToggle && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              zIndex: 2,
            }}
          >
            <Tooltip title={is_favorited ? '取消收藏' : '添加收藏'}>
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  onFavoriteToggle();
                }}
                sx={{
                  bgcolor: 'rgba(0, 0, 0, 0.6)',
                  width: 40,
                  height: 40,
                  '&:hover': {
                    bgcolor: 'rgba(0, 0, 0, 0.8)',
                  },
                }}
                aria-label={is_favorited ? '取消收藏' : '添加收藏'}
              >
                {is_favorited ? (
                  <Favorite sx={{ fontSize: 24, color: '#f5222d' }} />
                ) : (
                  <FavoriteBorder sx={{ fontSize: 24, color: 'white' }} />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* 标题区域 */}
      <Box
        sx={{
          p: 1.5,
          cursor: 'pointer',
        }}
        onClick={handleTitleClick}
      >
        <Typography
          variant="subtitle1"
          noWrap
          title={title}
          sx={{
            fontWeight: 500,
            '&:hover': {
              color: 'primary.main',
            },
            transition: 'color 0.2s',
          }}
        >
          {title}
        </Typography>
        {year && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: '0.875rem', mt: 0.25 }}
          >
            {year}
          </Typography>
        )}
      </Box>
    </Card>
  );
}
