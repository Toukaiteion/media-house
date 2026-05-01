import { useState, useEffect } from 'react';
import { Box, Card, Typography, Skeleton } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Movie as MovieIcon, Tv as TvIcon } from '@mui/icons-material';
import { api } from '../services/api';
import type { MediaLibrary, MovieDetail } from '../types';

const CARD_WIDTH = 360;
const CARD_HEIGHT = 240; // 16:9 比例

interface OverviewLibraryCardProps {
  library: MediaLibrary;
}

export function OverviewLibraryCard({ library }: OverviewLibraryCardProps) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [recentMovies, setRecentMovies] = useState<MovieDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecentMovies = async () => {
      try {
        const data = await api.getMoviesWithParams({
          libraryId: library.id,
          sortBy: 'create_time',
          sortOrder: 'desc',
          pageSize: 3,
        });
        setRecentMovies(data.items);
      } catch (err) {
        console.error('Failed to load recent movies:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRecentMovies();
  }, [library.id]);

  const handleMouseEnter = () => {
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  const handleClick = () => {
    navigate(`/media-center/movies?library_id=${library.id}`);
  };

  const getTypeIcon = () => {
    return library.type === 'Movie' ? <MovieIcon /> : <TvIcon />;
  };

  // 渲染单个电影封面单元格
  const renderMovieCell = (movie: MovieDetail | null, index: number) => {
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

    if (movie && movie.poster_path) {
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
            src={api.imageUrl(movie.poster_path)}
            alt={movie.title}
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
          display: 'flex',
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
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 6,
        width: CARD_WIDTH,
        transition: 'transform 0.3s ease-in-out',
        '&:hover': {
          transform: 'scale(1.05)',
          boxShadow: 8,
        },
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* 背景图片区域 - 横向 3 张 */}
      <Box
        sx={{
          position: 'relative',
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          display: 'flex',
          bgcolor: 'grey.800',
        }}
      >
        {renderMovieCell(recentMovies[0] || null, 0)}
        {renderMovieCell(recentMovies[1] || null, 1)}
        {renderMovieCell(recentMovies[2] || null, 2)}
      </Box>

      {/* 库名称 */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          p: 2,
          bgcolor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Typography variant="body2" color="white" noWrap align="center" sx={{ fontWeight: 500 }}>
          {library.name}
        </Typography>
      </Box>
    </Card>
  );
}
