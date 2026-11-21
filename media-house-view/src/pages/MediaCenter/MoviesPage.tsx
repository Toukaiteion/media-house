import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Grid,
  Alert,
  Pagination,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  type SelectChangeEvent,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { movieListCache } from '../../services/movieListCache';
import { useAuth } from '../../contexts/AuthContext';
import { MovieCard } from '../../components/MovieCard';
import { MovieFilterBar, type SortByKey, type CardSize } from '../../components/MovieFilterBar';
import { FilterStatusBar } from '../../components/FilterStatusBar';
import type { MovieDetail, MovieListParams, Tag, Actor, MediaLibrary } from '../../types';

const PAGE_SIZE_OPTIONS = [30, 50, 100];
const DEFAULT_PAGE_SIZE = 30;
const CARD_SIZE_STORAGE_KEY = 'movies_card_size';

const SORT_KEYS: SortByKey[] = ['default', 'recent', 'mostly_play', 'name', 'release_date', 'create_time'];
const CARD_SIZES: CardSize[] = ['small', 'medium', 'large'];

// 根据卡片大小获取网格列数
const getGridSize = (cardSize: CardSize) => {
  if (cardSize === 'small') {
    return { xs: 8, sm: 6, md: 4, lg: 3, xl: 2 };
  } else if (cardSize === 'large') {
    return { xs: 24, sm: 12, md: 8, lg: 6, xl: 4 };
  }
  return { xs: 24, sm: 12, md: 6, lg: 4, xl: 3 };
};

/** URL 里的筛选条件（唯一数据源，避免 state 和 URL 各存一份导致两者走神） */
interface MovieQueryState {
  page: number;
  pageSize: number;
  sortBy: SortByKey;
  sortOrder: 'asc' | 'desc';
  tags: string[];
  actorId: string | null;
  libraryId: string | null;
  myFavor: boolean;
  search: string;
}

function parseQuery(searchParams: URLSearchParams): MovieQueryState {
  const page = Number.parseInt(searchParams.get('page') ?? '', 10);
  const pageSizeParam = Number.parseInt(searchParams.get('pageSize') ?? '', 10);
  const sortParam = searchParams.get('sortBy') as SortByKey | null;

  // 兼容早期版本写在 URL 上的 mostly_play / recent_play
  const legacySort: SortByKey | null = searchParams.has('mostly_play')
    ? 'mostly_play'
    : searchParams.has('recent_play')
      ? 'recent'
      : null;

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSizeParam) ? pageSizeParam : DEFAULT_PAGE_SIZE,
    sortBy: sortParam && SORT_KEYS.includes(sortParam) ? sortParam : legacySort ?? 'default',
    sortOrder: searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
    tags: (searchParams.get('tag_ids') ?? '').split(',').filter(Boolean),
    actorId: searchParams.get('actor_id'),
    libraryId: searchParams.get('library_id'),
    myFavor: searchParams.has('my_favor'),
    search: searchParams.get('search') ?? '',
  };
}

export function MoviesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const queryState = useMemo(() => parseQuery(searchParams), [searchParams]);

  // 只保留「输入框的即时值」和「UI 偏好」，筛选条件一律走 URL
  const [searchValue, setSearchValue] = useState(queryState.search);
  const [cardSize, setCardSize] = useState<CardSize>(() => {
    const saved = localStorage.getItem(CARD_SIZE_STORAGE_KEY) as CardSize | null;
    return saved && CARD_SIZES.includes(saved) ? saved : 'medium';
  });

  // 标签和演员数据
  const [tags, setTags] = useState<Tag[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingActors, setLoadingActors] = useState(false);

  // 库数据
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);

  // 滚动相关
  const [filterBarVisible, setFilterBarVisible] = useState(true);
  const filterBarVisibleRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimerRef = useRef<number | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);

  // ---------------- 数据加载 ----------------

  const loadTagsAndActors = useCallback(async () => {
    try {
      setLoadingTags(true);
      setLoadingActors(true);
      // 筛选栏需要尽量全的候选，后端分页上限 500
      const [tagsData, actorsData] = await Promise.all([api.getTags(1, 500), api.getActors(1, 500)]);
      setTags(tagsData.tags);
      setActors(actorsData.actors);
    } catch (err) {
      console.error('加载标签或演员失败:', err);
    } finally {
      setLoadingTags(false);
      setLoadingActors(false);
    }
  }, []);

  const loadLibraries = useCallback(async () => {
    try {
      setLibraries(await api.getLibraries());
    } catch (err) {
      console.error('加载库列表失败:', err);
    }
  }, []);

  useEffect(() => {
    void loadTagsAndActors();
    void loadLibraries();
  }, [loadTagsAndActors, loadLibraries]);

  // URL 里的搜索词变化（前进/后退、清除筛选）时同步到输入框
  useEffect(() => {
    setSearchValue(queryState.search);
  }, [queryState.search]);

  // ---------------- 查询 ----------------

  const buildParams = useCallback(
    (q: MovieQueryState): MovieListParams => {
      const params: MovieListParams = {
        page: q.page,
        pageSize: q.pageSize,
        sortOrder: q.sortOrder,
      };

      if (q.libraryId) params.libraryId = Number.parseInt(q.libraryId, 10);
      if (q.tags.length > 0) params.tags = q.tags.join(',');
      if (q.actorId) params.actorId = Number.parseInt(q.actorId, 10);
      if (q.myFavor) {
        // 用户由后端从 token 解析，前端不再传 userId
        params.favor = true;
      }
      if (q.sortBy !== 'default') params.sortBy = q.sortBy;
      if (q.search) params.search = q.search;

      return params;
    },
    [],
  );

  const {
    data: moviesData,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['movies', searchParams.toString()],
    queryFn: () => api.getMoviesWithParams(buildParams(queryState)),
    // 翻页/改筛选时保留上一页数据，避免整页闪烁和布局跳动
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const movies = moviesData?.items ?? [];
  const total = moviesData?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / queryState.pageSize));

  // ---------------- 筛选条件变更（统一写 URL，并回到第一页） ----------------

  const updateParams = useCallback(
    (patch: Record<string, string | null>, resetPage = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          });
          // 筛选条件变了还停在第 5 页，多半会直接看到空列表
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      updateParams({ search: value || null }, true);
    },
    [updateParams],
  );

  const handleSortByChange = useCallback(
    (value: SortByKey) => {
      updateParams({ sortBy: value === 'default' ? null : value }, true);
    },
    [updateParams],
  );

  const handleSortOrderChange = useCallback(
    (order: 'asc' | 'desc') => {
      updateParams({ sortOrder: order }, true);
    },
    [updateParams],
  );

  const handleTagsChange = useCallback(
    (next: string[]) => {
      updateParams({ tag_ids: next.length > 0 ? next.join(',') : null }, true);
    },
    [updateParams],
  );

  const handleActorChange = useCallback(
    (actor: string | null) => {
      updateParams({ actor_id: actor }, true);
    },
    [updateParams],
  );

  const handleRemoveTag = useCallback(
    (tagId: string) => {
      handleTagsChange(queryState.tags.filter((tag) => tag !== tagId));
    },
    [handleTagsChange, queryState.tags],
  );

  const handleRemoveActor = useCallback(() => {
    updateParams({ actor_id: null }, true);
  }, [updateParams]);

  const handlePageChange = useCallback(
    (_: React.ChangeEvent<unknown>, value: number) => {
      updateParams({ page: value > 1 ? String(value) : null });
    },
    [updateParams],
  );

  const handlePageSizeChange = useCallback(
    (event: SelectChangeEvent<number>) => {
      const newSize = Number(event.target.value);
      updateParams({ pageSize: newSize === DEFAULT_PAGE_SIZE ? null : String(newSize) }, true);
    },
    [updateParams],
  );

  const handleRemoveSearch = useCallback(() => {
    setSearchValue('');
    updateParams({ search: null }, true);
  }, [updateParams]);

  const handleClearAll = useCallback(() => {
    setSearchValue('');
    updateParams({ tag_ids: null, actor_id: null, search: null }, true);
  }, [updateParams]);

  const handleCardSizeChange = useCallback((size: CardSize) => {
    setCardSize(size);
    localStorage.setItem(CARD_SIZE_STORAGE_KEY, size);
  }, []);

  // ---------------- 滚动：隐藏筛选栏 + 记忆位置 ----------------

  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    const y = el.scrollTop;
    const nextVisible = y <= 50 ? true : y < lastScrollYRef.current;
    lastScrollYRef.current = y;

    if (nextVisible !== filterBarVisibleRef.current) {
      filterBarVisibleRef.current = nextVisible;
      setFilterBarVisible(nextVisible);
    }

    // 节流写 sessionStorage：滚动事件一秒几十次，每次都序列化+写存储会卡
    if (scrollSaveTimerRef.current === null) {
      scrollSaveTimerRef.current = window.setTimeout(() => {
        scrollSaveTimerRef.current = null;
        movieListCache.saveUIState({
          scrollY: lastScrollYRef.current,
          filterBarVisible: filterBarVisibleRef.current,
        });
      }, 200);
    }
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    content.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      content.removeEventListener('scroll', handleScroll);
      if (scrollSaveTimerRef.current !== null) {
        window.clearTimeout(scrollSaveTimerRef.current);
        scrollSaveTimerRef.current = null;
      }
    };
  }, [handleScroll]);

  // 从播放页/详情页回来时恢复滚动位置（等列表渲染出来再滚动）
  useEffect(() => {
    const navigationSource = movieListCache.getNavigationSource();
    if (!navigationSource) return;

    movieListCache.setNavigationSource(null);
    const uiState = movieListCache.loadUIState();
    if (!uiState) return;

    pendingScrollRestoreRef.current = uiState.scrollY;
    filterBarVisibleRef.current = uiState.filterBarVisible;
    setFilterBarVisible(uiState.filterBarVisible);
  }, []);

  useEffect(() => {
    const target = pendingScrollRestoreRef.current;
    if (target === null || movies.length === 0) return;

    pendingScrollRestoreRef.current = null;
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: target, behavior: 'auto' });
    });
  }, [movies.length]);

  // ---------------- 其他 ----------------

  const handleFavoriteToggle = useCallback(
    async (movieId: number) => {
      try {
        const response = await api.toggleFavorite(movieId, user?.id ?? 0);
        // 按 id 更新，不要用下标——列表顺序一变就会改错条目
        queryClient.setQueryData(['movies', searchParams.toString()], (oldData: unknown) => {
          const data = oldData as { items?: MovieDetail[] } | undefined;
          if (!data?.items) return oldData;
          return {
            ...data,
            items: data.items.map((item) =>
              Number(item.id) === movieId ? { ...item, is_favorited: response.is_favorited } : item,
            ),
          };
        });
      } catch (err) {
        console.error('收藏切换失败:', err);
      }
    },
    [queryClient, searchParams, user?.id],
  );

  const currentLibraryName = useMemo(() => {
    if (!queryState.libraryId) return undefined;
    return libraries.find((lib) => lib.id === Number.parseInt(queryState.libraryId!, 10))?.name;
  }, [libraries, queryState.libraryId]);

  const hasActiveFilter =
    queryState.tags.length > 0 || Boolean(queryState.actorId) || Boolean(queryState.search) || queryState.myFavor;
  const showInitialLoading = isLoading && movies.length === 0;

  if (error && movies.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error instanceof Error ? error.message : '加载失败'}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box ref={contentRef} sx={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <MovieFilterBar
          visible={filterBarVisible}
          libraryId={queryState.libraryId ? Number.parseInt(queryState.libraryId, 10) : null}
          libraryName={currentLibraryName}
          myFavor={queryState.myFavor}
          searchValue={searchValue}
          onSearchChange={handleSearchChange}
          sortBy={queryState.sortBy}
          onSortByChange={handleSortByChange}
          sortOrder={queryState.sortOrder}
          onSortOrderChange={handleSortOrderChange}
          selectedTags={queryState.tags}
          onTagsChange={handleTagsChange}
          selectedActor={queryState.actorId}
          onActorChange={handleActorChange}
          tags={tags}
          actors={actors}
          loadingTags={loadingTags}
          loadingActors={loadingActors}
          cardSize={cardSize}
          onCardSizeChange={handleCardSizeChange}
        />

        <FilterStatusBar
          selectedTags={queryState.tags}
          selectedActor={queryState.actorId}
          searchValue={searchValue}
          tags={tags}
          actors={actors}
          onRemoveTag={handleRemoveTag}
          onRemoveActor={handleRemoveActor}
          onRemoveSearch={handleRemoveSearch}
          onClearAll={handleClearAll}
        />

        <Box sx={{ p: 3, pt: 2 }}>
          {showInitialLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
              <Typography color="text.secondary">加载中…</Typography>
            </Box>
          ) : (
            <Grid container spacing={3} columns={24} sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
              {movies.map((movie) => (
                <Grid size={getGridSize(cardSize)} key={movie.id}>
                  <MovieCard
                    media_id={Number(movie.id)}
                    poster_url={movie.poster_path}
                    title={movie.title}
                    year={movie.year}
                    is_favorited={movie.is_favorited}
                    size={cardSize}
                    onFavoriteToggle={() => handleFavoriteToggle(Number(movie.id))}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          {!showInitialLoading && movies.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                {hasActiveFilter ? '没有符合条件的结果' : '暂无电影'}
              </Typography>
              {hasActiveFilter && (
                <Button sx={{ mt: 2 }} variant="outlined" onClick={handleClearAll}>
                  清除全部筛选
                </Button>
              )}
            </Box>
          )}

          {!showInitialLoading && movies.length > 0 && total > 0 && (
            <Box
              sx={{
                mt: 4,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                共 {total} 条
              </Typography>
              <Pagination
                count={totalPages}
                page={Math.min(queryState.page, totalPages)}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
                disabled={isFetching}
              />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>每页显示</InputLabel>
                <Select
                  value={queryState.pageSize}
                  onChange={handlePageSizeChange}
                  label="每页显示"
                  disabled={isFetching}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <MenuItem key={size} value={size}>
                      {size} 条/页
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {error && movies.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error instanceof Error ? error.message : '加载失败'}
            </Alert>
          )}
        </Box>
      </Box>
    </Box>
  );
}
