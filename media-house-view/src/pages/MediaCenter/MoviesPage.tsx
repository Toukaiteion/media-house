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
import { api } from '../../services/api';
import { MovieCard } from '../../components/MovieCard';
import { MovieFilterBar, type SortByKey } from '../../components/MovieFilterBar';
import { FilterStatusBar } from '../../components/FilterStatusBar';
import type { MovieDetail, MovieListParams, Tag, Actor, MediaLibrary } from '../../types';

const PAGE_SIZE_OPTIONS = [30, 50, 100];
const DEFAULT_PAGE_SIZE = 30;
const MOVIES_STATE_KEY = 'movies-page-state';

export function MoviesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [movies, setMovies] = useState<MovieDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  // 滚动位置恢复
  const [restoreScrollY, setRestoreScrollY] = useState<number | null>(null);

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

  // 滚动相关
  const [filterBarVisible, setFilterBarVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 追踪初始加载是否已执行（防止重复请求）
  const hasInitializedRef = useRef(false);

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

  // 从 URL 初始化筛选状态，或从 sessionStorage 恢复状态
  useEffect(() => {
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
    } else {
      // 没有 URL 参数，从 sessionStorage 恢复状态
      const savedState = sessionStorage.getItem(MOVIES_STATE_KEY);
      if (savedState) {
        try {
          const { page: savedPage, pageSize: savedPageSize, scrollY } = JSON.parse(savedState);
          setPage(savedPage);
          setPageSize(savedPageSize);
          updateSearchParams({
            page: savedPage.toString(),
            pageSize: savedPageSize.toString(),
          });
          // 保存滚动位置以便数据加载后恢复
          setRestoreScrollY(scrollY);
        } catch (err) {
          console.error('恢复状态失败:', err);
        }
      }
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
  }, [lastScrollY]);

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

  // 保存状态到 sessionStorage（组件卸载时）
  useEffect(() => {
    const content = contentRef.current;
    return () => {
      sessionStorage.setItem(MOVIES_STATE_KEY, JSON.stringify({
        page,
        pageSize,
        scrollY: content?.scrollTop || 0,
      }));
    };
  }, [page, pageSize]);

  // 恢复滚动位置
  useEffect(() => {
    if (!loading && movies.length > 0 && restoreScrollY !== null) {
      setTimeout(() => {
        contentRef.current?.scrollTo({
          top: restoreScrollY,
          behavior: 'instant',
        });
        setRestoreScrollY(null);
        sessionStorage.removeItem(MOVIES_STATE_KEY);
      }, 100);
    }
  }, [loading, movies.length, restoreScrollY]);

  // 处理收藏切换
  const handleFavoriteToggle = async (movieId: number, currentIndex: number) => {
    try {
      const response = await api.toggleFavorite(movieId, 1);
      // 更新本地收藏状态
      setMovies((prev) => {
        const newMovies = [...prev];
        newMovies[currentIndex] = {
          ...newMovies[currentIndex],
          is_favorited: response.is_favorited,
        };
        return newMovies;
      });
    } catch (err) {
      console.error('收藏切换失败:', err);
    }
  };

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

  // 加载电影列表
  const loadMovies = async () => {
    try {
      setError(null);
      const params = buildQueryParams();
      console.log('params:', params);
      console.trace()
      const data = await api.getMoviesWithParams(params);

      setMovies(data.items);
      setTotal(data.total_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始化加载和页码变化时加载
  useEffect(() => {
    if (hasInitializedRef.current) {
      // 已经初始化过，按正常逻辑加载
      setLoading(true);
      loadMovies();
      return;
    }

    // 首次加载：检查 URL 参数或 sessionStorage 状态是否已设置
    const urlHasParams = searchParams.toString().length > 0;
    const libraryId = searchParams.get('library_id');
    const hasNavigationParams = libraryId !== null;

    if (urlHasParams || hasNavigationParams || searchParams.get('page')) {
      hasInitializedRef.current = true;
      setLoading(true);
      loadMovies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString(), page, pageSize]);

  if (error && movies.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
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
              {error}
            </Alert>
          )}
        </Box>
      </Box>
    </Box>
  );
}
