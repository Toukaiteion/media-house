import { useState, useEffect, useCallback, useRef } from 'react';
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
  type SelectChangeEvent,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { movieListCache } from '../../services/movieListCache';
import { MovieCard } from '../../components/MovieCard';
import { MovieFilterBar, type SortByKey, type CardSize } from '../../components/MovieFilterBar';
import { FilterStatusBar } from '../../components/FilterStatusBar';
import type { MovieDetail, MovieListParams, Tag, Actor, MediaLibrary } from '../../types';

const PAGE_SIZE_OPTIONS = [30, 50, 100];
const DEFAULT_PAGE_SIZE = 30;
// 根据卡片大小获取网格列数
const getGridSize = (cardSize: CardSize) => {
  if (cardSize === 'small') {
    return { xs: 8, sm: 6, md: 4, lg: 3, xl: 2 };
  } else if (cardSize === 'large') {
    return { xs: 24, sm: 12, md: 8, lg: 6, xl: 4 };
  }
  return { xs: 24, sm: 12, md: 6, lg: 4, xl: 3 };
};

export function MoviesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cardSize, setCardSize] = useState<CardSize>('medium');

  // 筛选栏状态
  const [searchValue, setSearchValue] = useState('');
  const [sortBy, setSortBy] = useState<SortByKey>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);

  // 标签和演员数据
  const [tags, setTags] = useState<Tag[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingActors, setLoadingActors] = useState(false);

  // 库数据
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);

  // 是否使用缓存（从播放页或详情页返回）
  const [shouldUseCache, setShouldUseCache] = useState(false);

  // 滚动相关
  const [filterBarVisible, setFilterBarVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  // 加载标签和演员数据
  const loadTagsAndActors = useCallback(async () => {
    try {
      setLoadingTags(true);
      setLoadingActors(true);
      const [tagsData, actorsData] = await Promise.all([
        api.getTags(1, 100),
        api.getActors(1, 100),
      ]);
      setTags(tagsData.tags);
      setActors(actorsData.actors);
    } catch (err) {
      console.error('加载标签或演员失败:', err);
    } finally {
      setLoadingTags(false);
      setLoadingActors(false);
    }
  }, []);

  // 加载库列表数据
  const loadLibraries = useCallback(async () => {
    try {
      const data = await api.getLibraries();
      setLibraries(data);
    } catch (err) {
      console.error('加载库列表失败:', err);
    }
  }, []);

  // 检查是否应该使用缓存并恢复 UI 状态
  useEffect(() => {
    const navigationSource = movieListCache.getNavigationSource();
    setShouldUseCache(navigationSource !== null);

    // 检查 URL 参数
    const urlHasParams = searchParams.toString().length > 0;
    const libraryId = searchParams.get('library_id');
    const hasNavigationParams = libraryId !== null;

    if (urlHasParams || hasNavigationParams) {
      // 从 URL 参数初始化状态
      setSearchValue(searchParams.get('search') || '');
      setSortBy((searchParams.get('sortBy') || 'default') as typeof sortBy);
      setSortOrder((searchParams.get('sortOrder') || 'desc') as typeof sortOrder);
      setPage(parseInt(searchParams.get('page') || '1'));
      setPageSize(parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)));

      const tagIds = searchParams.get('tag_ids');
      if (tagIds) {
        setSelectedTags(tagIds.split(','));
      } else {
        setSelectedTags([]);
      }

      const actorId = searchParams.get('actor_id');
      if (actorId) {
        setSelectedActor(actorId);
      } else {
        setSelectedActor(null);
      }
    }

    // 如果从播放/详情页返回，恢复 UI 状态
    if (navigationSource) {
      const uiState = movieListCache.loadUIState();
      if (uiState) {
        setFilterBarVisible(uiState.filterBarVisible);
        setTimeout(() => {
          contentRef.current?.scrollTo({
            top: uiState.scrollY,
            behavior: 'auto',
          });
        }, 100);
      }
      // 清除导航来源标记
      movieListCache.setNavigationSource(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadTagsAndActors();
    loadLibraries();
  }, [loadTagsAndActors, loadLibraries]);

  // 更新 URL 参数
  const updateSearchParams = useCallback((params: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === '') {
          newParams.delete(key);
        } else {
          newParams.set(key, value);
        }
      });
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  // 处理搜索输入
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    updateSearchParams({ search: value || null });
  }, [updateSearchParams]);

  // 处理排序方式变化
  const handleSortByChange = useCallback((value: SortByKey) => {
    setSortBy(value);
    updateSearchParams({ sortBy: value === 'default' ? null : value });
  }, [updateSearchParams]);

  // 处理排序顺序变化
  const handleSortOrderChange = useCallback((order: 'asc' | 'desc') => {
    setSortOrder(order);
    updateSearchParams({ sortOrder: order });
  }, [updateSearchParams]);

  // 处理标签选择
  const handleTagsChange = useCallback((tags: string[]) => {
    setSelectedTags(tags);
    updateSearchParams({ tag_ids: tags.length > 0 ? tags.join(',') : null });
  }, [updateSearchParams]);

  // 处理演员选择
  const handleActorChange = useCallback((actor: string | null) => {
    setSelectedActor(actor);
    updateSearchParams({ actor_id: actor });
  }, [updateSearchParams]);

  // 处理移除标签
  const handleRemoveTag = useCallback((tagId: string) => {
    const newTags = selectedTags.filter(id => id !== tagId);
    setSelectedTags(newTags);
    updateSearchParams({ tag_ids: newTags.length > 0 ? newTags.join(',') : null });
  }, [selectedTags, updateSearchParams]);

  // 处理移除演员
  const handleRemoveActor = useCallback(() => {
    setSelectedActor(null);
    updateSearchParams({ actor_id: null });
  }, [updateSearchParams]);

  // 处理页码变化
  const handlePageChange = useCallback((_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    updateSearchParams({ page: value.toString() });
  }, [updateSearchParams]);

  // 处理每页大小变化
  const handlePageSizeChange = useCallback((event: SelectChangeEvent<number>) => {
    const newSize = event.target.value;
    setPageSize(newSize);
    setPage(1); // 重置到第一页
    updateSearchParams({ pageSize: newSize.toString(), page: '1' });
  }, [updateSearchParams]);

  // 处理移除搜索
  const handleRemoveSearch = useCallback(() => {

    setSearchValue('');
    updateSearchParams({ search: null });
  }, [updateSearchParams]);
  // 处理卡片大小变化
  const handleCardSizeChange = useCallback((size: CardSize) => {
    setCardSize(size);
  }, []);


  // 处理清除全部
  const handleClearAll = useCallback(() => {
    setSelectedTags([]);
    setSelectedActor(null);
    setSearchValue('');
    updateSearchParams({
      tag_ids: null,
      actor_id: null,
      search: null,
    });
    setPage(1);
  }, [updateSearchParams]);

  // 获取当前库的名称
  const getCurrentLibraryName = () => {
    const libraryId = searchParams.get('library_id');
    if (!libraryId) return undefined;
    const library = libraries.find(lib => lib.id === parseInt(libraryId));
    return library?.name;
  };

  // 获取当前是否为我的最爱
  const getMyFavor = () => {
    return searchParams.get('my_favor') !== null;
  };

  // 处理滚动事件
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    const currentScrollY = target.scrollTop;

    // 保存 UI 状态到缓存
    movieListCache.saveUIState({
      scrollY: currentScrollY,
      filterBarVisible,
    });

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // 向下滚动，隐藏筛选栏
        setFilterBarVisible(false);
      } else if (currentScrollY < lastScrollY || currentScrollY <= 0) {
        // 向上滚动或到达顶部，显示筛选栏
        setFilterBarVisible(true);
      }
      setLastScrollY(currentScrollY);
    }, 50);
  }, [lastScrollY, filterBarVisible]);

  // 注册滚动监听
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    content.addEventListener('scroll', handleScroll);
    return () => {
      content.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // 构建查询参数
  const buildQueryParams = (): MovieListParams => {
    const params: MovieListParams = {
      // 优先使用 URL 参数，URL 没有时才使用 state 值（避免重复请求）
      page: parseInt(searchParams.get('page') || String(page)),
      pageSize: parseInt(searchParams.get('pageSize') || String(pageSize)),
    };

    const libraryId = searchParams.get('library_id');
    const tagIds = searchParams.get('tag_ids');
    const actorId = searchParams.get('actor_id');
    const myFavor = searchParams.get('my_favor');

    // 从 URL 获取筛选条件
    const urlSortBy = searchParams.get('sortBy') as MovieListParams['sortBy'];
    const urlSearch = searchParams.get('search');
    const urlSortOrder = searchParams.get('sortOrder') as 'asc' | 'desc';

    // 兼容旧的 URL 参数
    const mostlyPlay = searchParams.get('mostly_play');
    const recentPlay = searchParams.get('recent_play');

    if (libraryId) {
      params.libraryId = parseInt(libraryId);
    }
    if (tagIds) {
      params.tags = tagIds;
    }
    if (actorId) {
      params.actorId = parseInt(actorId);
    }
    if (myFavor) {
      params.favor = true;
      params.userId = 1; // TODO: 从用户上下文获取
    }

    // 优先使用新的 sortBy 参数，兼容旧的 mostlyPlay 和 recentPlay
    if (urlSortBy) {
      params.sortBy = urlSortBy;
    } else if (mostlyPlay) {
      params.sortBy = 'mostly_play';
    } else if (recentPlay) {
      params.sortBy = 'recent';
    }

    if (urlSearch) {
      params.search = urlSearch;
    }

    if (urlSortOrder) {
      params.sortOrder = urlSortOrder;
    }

    return params;
  };

  // 使用 react-query 缓存电影列表数据
  const { data: moviesData, isLoading, error } = useQuery({
    queryKey: ['movies', searchParams.toString()],
    queryFn: async () => {
      const params = buildQueryParams();
      return await api.getMoviesWithParams(params);
    },
    // 从播放/详情页返回时，优先使用缓存（staleTime = Infinity）
    staleTime: shouldUseCache ? Infinity : 5 * 60 * 1000,
    // 正常情况下 5 分钟后重新获取数据
  });

  const movies = moviesData?.items || [];
  const total = moviesData?.total_count || 0;

  // 如果使用缓存，不显示 loading 状态
  const loading = shouldUseCache ? false : isLoading;

  // 处理收藏切换
  const handleFavoriteToggle = async (movieId: number, currentIndex: number) => {
    try {
      const response = await api.toggleFavorite(movieId, 1);
      // 更新 react-query 缓存中的数据
      queryClient.setQueryData(['movies', searchParams.toString()], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((item: MovieDetail, idx: number) =>
            idx === currentIndex ? { ...item, is_favorited: response.is_favorited } : item
          ),
        };
      });
    } catch (err) {
      console.error('收藏切换失败:', err);
    }
  };

  if (error && movies.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error instanceof Error ? error.message : '加载失败'}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 滚动内容区域 */}
      <Box
        ref={contentRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* 筛选栏 */}
        <MovieFilterBar
          visible={filterBarVisible}
          libraryId={searchParams.get('library_id') ? parseInt(searchParams.get('library_id')!) : null}
          libraryName={getCurrentLibraryName()}
          myFavor={getMyFavor()}
          searchValue={searchValue}
          onSearchChange={handleSearchChange}
          sortBy={sortBy}
          onSortByChange={handleSortByChange}
          sortOrder={sortOrder}
          onSortOrderChange={handleSortOrderChange}
          selectedTags={selectedTags}
          onTagsChange={handleTagsChange}
          selectedActor={selectedActor}
          onActorChange={handleActorChange}
          tags={tags}
          actors={actors}
          loadingTags={loadingTags}
          loadingActors={loadingActors}
          cardSize={cardSize}
          onCardSizeChange={handleCardSizeChange}
        />

        {/* 筛选状态栏 */}
        <FilterStatusBar
          selectedTags={selectedTags}
          selectedActor={selectedActor}
          searchValue={searchValue}
          tags={tags}
          actors={actors}
          onRemoveTag={handleRemoveTag}
          onRemoveActor={handleRemoveActor}
          onRemoveSearch={handleRemoveSearch}
          onClearAll={handleClearAll}
        />

        {/* 电影内容 */}
        <Box sx={{ p: 3, pt: 2 }}>
          {/* 电影网格 */}
          <Grid container spacing={3} columns={24}>
            {movies.map((movie, index) => (
              <Grid size={getGridSize(cardSize)} key={movie.id}>
                <MovieCard
                  media_id={parseInt(movie.id)}
                  poster_url={movie.poster_path}
                  title={movie.title}
                  year={movie.year}
                  is_favorited={movie.is_favorited}
                  size={cardSize}
                  onFavoriteToggle={() => handleFavoriteToggle(parseInt(movie.id), index)}
                />
              </Grid>
            ))}
          </Grid>

          {/* 分页控制 */}
          {!loading && movies.length > 0 && total > 0 && (
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
                count={Math.ceil(total / pageSize)}
                page={page}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
                disabled={loading}
              />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>每页显示</InputLabel>
                <Select
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  label="每页显示"
                  disabled={loading}
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

          {/* 空状态 */}
          {!loading && movies.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                暂无电影
              </Typography>
            </Box>
          )}

          {/* 错误提示（已有数据时） */}
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
