import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { api } from '../../services/api';
import { MovieCard } from '../../components/MovieCard';
import type { MovieDetail } from '../../types';

const PAGE_SIZE = 18;
const USER_ID = 1; // TODO: 从用户上下文获取

export function FavoritesPage() {
  const [movies, setMovies] = useState<MovieDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // 滚动相关引用
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 加载收藏电影列表
  const loadMovies = async (reset = false) => {
    try {
      setError(null);
      const params = {
        page,
        pageSize: PAGE_SIZE,
        favor: true,
        userId: USER_ID,
      };
      const data = await api.getMoviesWithParams(params);

      if (reset) {
        setMovies(data.items);
      } else {
        setMovies((prev) => [...prev, ...data.items]);
      }
      setTotal(data.total_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始化加载
  useEffect(() => {
    setPage(1);
    setLoading(true);
    loadMovies(true);
  }, []);

  // 无限滚动 - Intersection Observer
  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && movies.length < total) {
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loading, movies.length, total]);

  useEffect(() => {
    if (page > 1) {
      setLoading(true);
      loadMovies(false);
    }
  }, [page]);

  // 处理收藏切换
  const handleFavoriteToggle = async (movieId: number, currentIndex: number) => {
    try {
      const response = await api.toggleFavorite(movieId, USER_ID);
      // 更新本地收藏状态
      setMovies((prev) => {
        const newMovies = [...prev];
        newMovies[currentIndex] = {
          ...newMovies[currentIndex],
          is_favorited: response.is_favorited,
        };
        return newMovies;
      });

      // 如果取消收藏，从列表中移除
      if (!response.is_favorited) {
        setTimeout(() => {
          setMovies((prev) => prev.filter((_, idx) => idx !== currentIndex));
          setTotal((prev) => prev - 1);
        }, 300);
      }
    } catch (err) {
      console.error('收藏切换失败:', err);
    }
  };

  if (error && movies.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 页面标题 */}
      <Box sx={{ p: 3, pb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          我的喜欢
        </Typography>
      </Box>

      {/* 滚动内容区域 */}
      <Box
        ref={contentRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* 电影内容 */}
        <Box sx={{ p: 3, pt: 1 }}>
          {/* 电影网格 */}
          <Grid container spacing={3}>
            {movies.map((movie, index) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }} key={movie.id}>
                <MovieCard
                  media_id={parseInt(movie.id)}
                  poster_url={movie.poster_path}
                  title={movie.title}
                  year={movie.year}
                  is_favorited={movie.is_favorited}
                  onFavoriteToggle={() => handleFavoriteToggle(parseInt(movie.id), index)}
                />
              </Grid>
            ))}
          </Grid>

          {/* 加载更多指示器 */}
          {movies.length < total && (
            <Box
              ref={loadMoreRef}
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                py: 4,
              }}
            >
              <CircularProgress />
            </Box>
          )}

          {/* 无更多数据 */}
          {movies.length >= total && movies.length > 0 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                没有更多收藏了
              </Typography>
            </Box>
          )}

          {/* 空状态 */}
          {!loading && movies.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                暂无收藏
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                去电影页面添加一些喜欢的电影吧
              </Typography>
            </Box>
          )}

          {/* 错误提示（已有数据时） */}
          {error && movies.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </Box>
    </Box>
  );
}
