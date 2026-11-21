import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Grid,
  CircularProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { InfoCard } from '../../components/InfoCard';
import type { Actor } from '../../types';

export function ActorsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const favoritedOnly = searchParams.get('favorited') === '1';

  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadActors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const pageSize = 100;
      let allActors: Actor[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const data = await api.getActors(page, pageSize, favoritedOnly);
        allActors = [...allActors, ...data.actors];
        hasMore = data.actors.length > 0 && allActors.length < data.total_count;
        page++;
      }

      setActors(allActors);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [favoritedOnly]);

  useEffect(() => {
    void loadActors();
  }, [loadActors]);

  const handleToggleFavorite = async (actor: Actor) => {
    const next = !actor.is_favorited;

    setActors((prev) => prev.map((item) => (item.id === actor.id ? { ...item, is_favorited: next } : item)));

    try {
      await api.toggleActorFavorite(actor.id);
      if (favoritedOnly) await loadActors();
    } catch (err) {
      setActors((prev) => prev.map((item) => (item.id === actor.id ? { ...item, is_favorited: !next } : item)));
      setError(err instanceof Error ? err.message : '收藏操作失败');
    }
  };

  const handleActorClick = (actorId: string) => {
    navigate(`/media-center/movies?actor_id=${actorId}`);
  };

  const getAvatarUrl = (avatarPath?: string) => (avatarPath ? api.imageUrl(avatarPath) : undefined);

  const filteredActors = searchTerm.trim()
    ? actors.filter((actor) => actor.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : actors;

  if (error && actors.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, width: '100%' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3, gap: 2 }}>
        <TextField
          fullWidth
          placeholder="搜索演员..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{ maxWidth: 600 }}
        />

        <ToggleButtonGroup
          exclusive
          size="small"
          value={favoritedOnly ? 'fav' : 'all'}
          onChange={(_, value) => {
            if (!value) return;
            const next = new URLSearchParams(searchParams);
            if (value === 'fav') next.set('favorited', '1');
            else next.delete('favorited');
            setSearchParams(next, { replace: true });
          }}
        >
          <ToggleButton value="all">全部</ToggleButton>
          <ToggleButton value="fav">
            <FavoriteIcon fontSize="small" sx={{ mr: 0.5, color: 'error.main' }} />
            我的收藏
          </ToggleButton>
        </ToggleButtonGroup>

        {!loading && (
          <Typography variant="body2" color="text.secondary">
            共 {actors.length} 位演员{favoritedOnly ? '（已收藏）' : ''}
          </Typography>
        )}
      </Box>

      {loading && actors.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={3}>
            {filteredActors.map((actor) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }} key={actor.id}>
                <InfoCard
                  title={actor.name}
                  count={actor.media_count}
                  onClick={() => handleActorClick(actor.id)}
                  avatar={getAvatarUrl(actor.avatar_path)}
                  favorite={actor.is_favorited}
                  onToggleFavorite={() => handleToggleFavorite(actor)}
                />
              </Grid>
            ))}
          </Grid>

          {!loading && filteredActors.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                {searchTerm
                  ? '未找到匹配的演员'
                  : favoritedOnly
                    ? '还没有收藏演员，点演员卡片右上角的心形收藏'
                    : '暂无演员'}
              </Typography>
            </Box>
          )}

          {error && actors.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}
