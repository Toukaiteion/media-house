import { useState, useEffect } from 'react';
import { Box, Typography, TextField, Grid, CircularProgress, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { InfoCard } from '../../components/InfoCard';
import type { Tag } from '../../types';

export function TagsPage() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadTags = async () => {
    try {
      setError(null);
      const pageSize = 100;
      let allTags: Tag[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const data = await api.getTags(page, pageSize);
        allTags = [...allTags, ...data.tags];
        hasMore = allTags.length < data.total_count;
        page++;
      }

      setTags(allTags);
      setFilteredTags(allTags);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredTags(tags);
    } else {
      const filtered = tags.filter((tag) =>
        tag.tag_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredTags(filtered);
    }
  }, [searchTerm, tags]);

  const handleTagClick = (tagId: string) => {
    navigate(`/media-center/movies?tag_ids=${tagId}`);
  };

  if (error && tags.length === 0) {
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
          placeholder="搜索标签..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{ maxWidth: 600 }}
        />
        {!loading && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            共 {tags.length} 个标签
          </Typography>
        )}
      </Box>

      {loading && tags.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={3}>
            {filteredTags.map((tag) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }} key={tag.id}>
                <InfoCard
                  title={tag.tag_name}
                  count={tag.media_count}
                  onClick={() => handleTagClick(tag.id)}
                />
              </Grid>
            ))}
          </Grid>

          {!loading && filteredTags.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                {searchTerm ? '未找到匹配的标签' : '暂无标签'}
              </Typography>
            </Box>
          )}

          {error && tags.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}
