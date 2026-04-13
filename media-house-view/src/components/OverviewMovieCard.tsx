import { useState } from 'react';
import { Box, Card, Typography, Fade, IconButton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { PlayArrow as PlayIcon } from '@mui/icons-material';
import { api } from '../services/api';
import type { MovieDetail } from '../types';

const CARD_WIDTH = 320;
const CARD_HEIGHT = 216; // 800:538 比例

interface OverviewMovieCardProps {
  movie: MovieDetail;
}

export function OverviewMovieCard({ movie }: OverviewMovieCardProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  const thumbUrl = movie.thumb_path ? api.imageUrl(movie.thumb_path) : undefined;

  const handlePosterClick = () => {
    navigate(`/play/${movie.id}`);
  };

  const handleTitleClick = () => {
    navigate(`/media-center/movies/${movie.id}`);
  };

  return (
    <Card
      sx={{
        width: CARD_WIDTH,
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 2,
        transition: 'box-shadow 0.3s ease-in-out',
        '&:hover': {
          boxShadow: 8,
        },
      }}
    >
      {/* 缩略图图片区域 */}
      <Box
        sx={{
          position: 'relative',
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          bgcolor: 'grey.800',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handlePosterClick}
      >
        {/* 缩略图图片 */}
        {thumbUrl ? (
          <Box
            component="img"
            src={thumbUrl}
            alt={movie.title}
            sx={{
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
            }}
          >
            <PlayIcon sx={{ fontSize: 48 }} />
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
                width: 56,
                height: 56,
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 1)',
                  transform: 'scale(1.1)',
                },
                transition: 'transform 0.2s',
              }}
              aria-label="播放"
            >
              <PlayIcon sx={{ fontSize: 32, color: theme.palette.mode === 'dark' ? 'white' : 'text.primary' }} />
            </IconButton>
          </Box>
        </Fade>
      </Box>

      {/* 标题区域 */}
      <Box
        sx={{
          p: 1,
          cursor: 'pointer',
        }}
        onClick={handleTitleClick}
      >
        <Typography
          variant="body2"
          noWrap
          title={movie.title}
          sx={{
            fontWeight: 500,
            fontSize: '0.875rem',
            '&:hover': {
              color: 'primary.main',
            },
            transition: 'color 0.2s',
          }}
        >
          {movie.title}
        </Typography>
        {movie.year && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.75rem', mt: 0.25 }}
          >
            {movie.year}
          </Typography>
        )}
      </Box>
    </Card>
  );
}
