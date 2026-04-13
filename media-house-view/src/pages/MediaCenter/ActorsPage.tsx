import { useState, useEffect } from 'react';
import { Box, Typography, TextField, Grid, CircularProgress, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { InfoCard } from '../../components/InfoCard';
import type { Actor } from '../../types';

export function ActorsPage() {
  const navigate = useNavigate();
  const [actors, setActors] = useState<Actor[]>([]);
  const [filteredActors, setFilteredActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadActors = async () => {
    try {
      setError(null);
      const pageSize = 100;
      let allActors: Actor[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const data = await api.getActors(page, pageSize);
        allActors = [...allActors, ...data.actors];
        hasMore = allActors.length < data.total_count;
        page++;
      }

      setActors(allActors);
      setFilteredActors(allActors);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActors();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredActors(actors);
    } else {
      const filtered = actors.filter((actor) =>
        actor.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredActors(filtered);
    }
  }, [searchTerm, actors]);

  const handleActorClick = (actorId: string) => {
    navigate(`/media-center/movies?actor_id=${actorId}`);
  };

  const getAvatarUrl = (avatarPath?: string) => {
    return avatarPath ? api.imageUrl(avatarPath) : undefined;
  };

  if (error && actors.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, width: '100%' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
        <TextField
          fullWidth
          placeholder="搜索演员..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{ maxWidth: 600 }}
        />
        {!loading && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            共 {actors.length} 位演员
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
                />
              </Grid>
            ))}
          </Grid>

          {!loading && filteredActors.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                {searchTerm ? '未找到匹配的演员' : '暂无演员'}
              </Typography>
            </Box>
          )}

          {error && actors.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}
