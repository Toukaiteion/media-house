import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Grid, CircularProgress, Alert, Tabs, Tab, Button } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { MovieCard } from '../../components/MovieCard';
import { InfoCard } from '../../components/InfoCard';
import { Toast } from '../../components/Toast';
import type { MovieDetail, Tag, Actor } from '../../types';

type FavoritesTab = 'movies' | 'actors' | 'tags';

const PAGE_SIZE = 100;
const TAB_KEYS: FavoritesTab[] = ['movies', 'actors', 'tags'];

export function FavoritesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab') as FavoritesTab | null;
  const tab: FavoritesTab = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'movies';

  const [movies, setMovies] = useState<MovieDetail[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 收藏数量通常不大，直接把全部分页拉完，省掉翻页交互
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const collect = async <T,>(
        fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
      ): Promise<T[]> => {
        let all: T[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const { items, total } = await fetchPage(page, PAGE_SIZE);
          all = [...all, ...items];
          hasMore = items.length > 0 && all.length < total;
          page++;
        }
        return all;
      };

      const [favoriteMovies, favoriteActors, favoriteTags] = await Promise.all([
        collect<MovieDetail>(async (page, pageSize) => {
          const data = await api.getMoviesWithParams({ page, pageSize, favor: true });
          return { items: data.items, total: data.total_count };
        }),
        collect<Actor>(async (page, pageSize) => {
          const data = await api.getActors(page, pageSize, true);
          return { items: data.actors, total: data.total_count };
        }),
        collect<Tag>(async (page, pageSize) => {
          const data = await api.getTags(page, pageSize, true);
          return { items: data.tags, total: data.total_count };
        }),
      ]);

      setMovies(favoriteMovies);
      setActors(favoriteActors);
      setTags(favoriteTags);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const switchTab = (_: React.SyntheticEvent, value: FavoritesTab) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'movies') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const handleUnfavoriteActor = async (actor: Actor) => {
    setActors((prev) => prev.filter((item) => item.id !== actor.id));
    try {
      await api.toggleActorFavorite(actor.id);
      setToast(`已取消关注 ${actor.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消关注失败');
      void loadAll();
    }
  };

  const handleUnfavoriteTag = async (tag: Tag) => {
    setTags((prev) => prev.filter((item) => item.id !== tag.id));
    try {
      await api.toggleTagFavorite(tag.id);
      setToast(`已取消收藏 ${tag.tag_name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消收藏失败');
      void loadAll();
    }
  };

  // 影片收藏页里的取消收藏，直接整页刷新一次即可（复用影片列表的收藏接口）
  const handleToggleMovieFavorite = async (mediaId: number) => {
    try {
      await api.toggleFavorite(mediaId, 0);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消收藏失败');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const emptyState = (title: string, actionText: string, action: () => void) => (
    <Box sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h6" color="text.secondary" gutterBottom>
        {title}
      </Typography>
      <Button variant="outlined" sx={{ mt: 1 }} onClick={action}>
        {actionText}
      </Button>
    </Box>
  );

  return (
    <Box sx={{ p: 3, width: '100%' }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        我的喜欢
      </Typography>

      <Tabs value={tab} onChange={switchTab} sx={{ mb: 3 }}>
        <Tab value="movies" label={`影片 ${movies.length}`} />
        <Tab value="actors" label={`演员 ${actors.length}`} />
        <Tab
          value="tags"
          label={
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              标签 {tags.length}
            </Box>
          }
        />
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {tab === 'movies' &&
        (movies.length === 0
          ? emptyState('还没有收藏影片', '去电影页看看', () => navigate('/media-center/movies'))
          : (
            <Grid container spacing={3} columns={24}>
              {movies.map((movie) => (
                <Grid size={{ xs: 24, sm: 12, md: 6, lg: 4, xl: 3 }} key={movie.id}>
                  <MovieCard
                    media_id={Number(movie.id)}
                    poster_url={movie.poster_path}
                    title={movie.title}
                    year={movie.year}
                    is_favorited
                    onFavoriteToggle={() => handleToggleMovieFavorite(Number(movie.id))}
                  />
                </Grid>
              ))}
            </Grid>
          ))}

      {tab === 'actors' &&
        (actors.length === 0
          ? emptyState('还没有关注的演员', '去演员页看看', () => navigate('/media-center/actors'))
          : (
            <Grid container spacing={3}>
              {actors.map((actor) => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }} key={actor.id}>
                  <InfoCard
                    title={actor.name}
                    count={actor.media_count}
                    avatar={actor.avatar_path ? api.imageUrl(actor.avatar_path) : undefined}
                    onClick={() => navigate(`/media-center/movies?actor_id=${actor.id}`)}
                    favorite
                    favoriteKind="actor"
                    onToggleFavorite={() => handleUnfavoriteActor(actor)}
                  />
                </Grid>
              ))}
            </Grid>
          ))}

      {tab === 'tags' &&
        (tags.length === 0
          ? emptyState('还没有收藏的标签', '去标签页看看', () => navigate('/media-center/tags'))
          : (
            <Grid container spacing={3}>
              {tags.map((tag) => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }} key={tag.id}>
                  <InfoCard
                    title={tag.tag_name}
                    count={tag.media_count}
                    onClick={() => navigate(`/media-center/movies?tag_ids=${tag.id}`)}
                    favorite
                    favoriteKind="tag"
                    onToggleFavorite={() => handleUnfavoriteTag(tag)}
                  />
                </Grid>
              ))}
            </Grid>
          ))}

      <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <Typography variant="body2">
          影片点心形「喜欢」，演员点人形按钮「关注」，标签点书签按钮「收藏」，都会出现在这里
        </Typography>
      </Box>

      <Toast message={toast} onClose={() => setToast(null)} />
    </Box>
  );
}
