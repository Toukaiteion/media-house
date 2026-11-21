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
import FavoriteIcon from '@mui/icons-material/BookmarkAdded';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { InfoCard } from '../../components/InfoCard';
import { Toast } from '../../components/Toast';
import type { Tag } from '../../types';

export function TagsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 收藏筛选放在 URL 里，刷新和前进/后退都能保留
  const favoritedOnly = searchParams.get('favorited') === '1';

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const pageSize = 100;
      let allTags: Tag[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const data = await api.getTags(page, pageSize, favoritedOnly);
        allTags = [...allTags, ...data.tags];
        hasMore = data.tags.length > 0 && allTags.length < data.total_count;
        page++;
      }

      setTags(allTags);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [favoritedOnly]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const handleToggleFavorite = async (tag: Tag) => {
    const next = !tag.is_favorited;

    // 先乐观更新，失败再回滚
    setTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, is_favorited: next } : item)));

    try {
      await api.toggleTagFavorite(tag.id);
      setToast(next ? `已收藏 ${tag.tag_name}` : `已取消收藏 ${tag.tag_name}`);
      // 在「只看收藏」里取消收藏，要把它从列表里去掉
      if (favoritedOnly) await loadTags();
    } catch (err) {
      setTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, is_favorited: !next } : item)));
      setError(err instanceof Error ? err.message : '收藏操作失败');
    }
  };

  const handleTagClick = (tagId: string) => {
    navigate(`/media-center/movies?tag_ids=${tagId}`);
  };

  const filteredTags = searchTerm.trim()
    ? tags.filter((tag) => tag.tag_name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : tags;

  if (error && tags.length === 0) {
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
          placeholder="搜索标签..."
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
            共 {tags.length} 个标签{favoritedOnly ? '（已收藏）' : ''}
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
                  favorite={tag.is_favorited}
                  favoriteKind="tag"
                  onToggleFavorite={() => handleToggleFavorite(tag)}
                />
              </Grid>
            ))}
          </Grid>

          {!loading && filteredTags.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                {searchTerm
                  ? '未找到匹配的标签'
                  : favoritedOnly
                    ? '还没有收藏标签，点标签卡片右上角的书签收藏'
                    : '暂无标签'}
              </Typography>
            </Box>
          )}

          {error && tags.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </Box>
  );
}
