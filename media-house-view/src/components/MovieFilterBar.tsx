import { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  Select,
  MenuItem,
  Checkbox,
  Chip,
  Typography,
  styled,
  alpha,
  IconButton,
  Tooltip,
  Button,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  Search,
  ArrowUpward,
  ArrowDownward,
  GridView as GridIcon,
  TableRows as ListIcon,
  ViewModule as MediumIcon,
} from '@mui/icons-material';
import type { Tag, Actor } from '../types';

export type SortByKey = 'default' | 'recent' | 'mostly_play' | 'name' | 'release_date' | 'create_time';
export type CardSize = 'small' | 'medium' | 'large';

interface MovieFilterBarProps {
  visible: boolean;
  libraryId?: number | null;
  libraryName?: string;
  myFavor?: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortBy: SortByKey;
  onSortByChange: (value: SortByKey) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (order: 'asc' | 'desc') => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  selectedActor: string | null;
  onActorChange: (actor: string | null) => void;
  tags: Tag[];
  actors: Actor[];
  loadingTags?: boolean;
  loadingActors?: boolean;
  cardSize: CardSize;
  onCardSizeChange: (size: CardSize) => void;
}

// 排序选项
const sortOptions = [
  { value: 'default', label: '默认排序' },
  { value: 'recent', label: '最近播放' },
  { value: 'mostly_play', label: '最多播放' },
  { value: 'name', label: '名称' },
  { value: 'release_date', label: '上映日期' },
  { value: 'create_time', label: '创建时间' },
] as const;

// 卡片大小选项
const cardSizeOptions = [
  { value: 'small' as const, label: '小', icon: <GridIcon fontSize="small" /> },
  { value: 'medium' as const, label: '中', icon: <MediumIcon fontSize="small" /> },
  { value: 'large' as const, label: '大', icon: <ListIcon fontSize="small" /> },
];

// 滚动隐藏的筛选栏组件
const FilterBar = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'visible',
})<{ visible: boolean }>(({ theme, visible }) => ({
  position: 'sticky',
  top: 0,
  zIndex: 10,
  backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.95) : alpha(theme.palette.background.paper, 0.95),
  backdropFilter: 'blur(8px)',
  borderBottom: `1px solid ${theme.palette.divider}`,
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  transform: visible ? 'translateY(0)' : 'translateY(-100%)',
  transition: 'transform 0.2s ease-in-out',
  flexWrap: 'wrap',
}));


export function MovieFilterBar({
  visible,
  libraryId,
  libraryName,
  myFavor,
  searchValue,
  onSearchChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  selectedTags,
  onTagsChange,
  selectedActor,
  onActorChange,
  tags,
  actors,
  loadingTags = false,
  loadingActors = false,
  cardSize,
  onCardSizeChange,
}: MovieFilterBarProps) {
  const [tagSearch, setTagSearch] = useState('');
  const [actorSearch, setActorSearch] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [actorDropdownOpen, setActorDropdownOpen] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 分页状态
  const TAGS_PAGE_SIZE = 50;
  const ACTORS_PAGE_SIZE = 50;
  const [tagPage, setTagPage] = useState(1);
  const [actorPage, setActorPage] = useState(1);

  // 生成标题文本
  const getTitleText = () => {
    if (libraryId && myFavor) {
      return `${libraryName || '媒体库'} / 我的最爱`;
    } else if (libraryId) {
      return libraryName || '媒体库';
    } else if (myFavor) {
      return '我的最爱';
    }
    return '全部影片';
  };

  // 过滤标签
  const filteredTags = tags.filter(tag =>
    tag.tag_name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  // 过滤演员
  const filteredActors = actors.filter(actor =>
    actor.name.toLowerCase().includes(actorSearch.toLowerCase())
  );

  // 分页后的标签
  const paginatedTags = filteredTags.slice(0, tagPage * TAGS_PAGE_SIZE);
  const hasMoreTags = paginatedTags.length < filteredTags.length;

  // 分页后的演员
  const paginatedActors = filteredActors.slice(0, actorPage * ACTORS_PAGE_SIZE);
  const hasMoreActors = paginatedActors.length < filteredActors.length;

  // 处理搜索输入（防抖）
  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      onSearchChange(value);
    }, 500);
  };

  // 处理标签选择
  const handleTagClick = (tagId: string) => {
    const isSelected = selectedTags.includes(tagId);
    if (isSelected) {
      onTagsChange(selectedTags.filter(id => id !== tagId));
    } else {
      onTagsChange([...selectedTags, tagId]);
    }
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <FilterBar visible={visible}>
      {/* 标题 */}
      <Typography
        variant="h6"
        sx={{
          fontWeight: 600,
          fontSize: '1.1rem',
          mr: 2,
        }}
      >
        {getTitleText()}
      </Typography>

      {/* 搜索框 */}
      <TextField
        size="small"
        placeholder="搜索电影..."
        defaultValue={searchValue}
        onChange={(e) => handleSearchChange(e.target.value)}
        sx={{
          width: 400,
          '& .MuiInputBase-root': {
            height: 36,
            borderRadius: 2,
          },
        }}
        InputProps={{
          startAdornment: <Search fontSize="small" sx={{ ml: 0.5 }} />,
        }}
      />

      {/* 标签多选下拉框 */}
      <Select
        size="small"
        multiple
        value={selectedTags}
        onOpen={() => setTagDropdownOpen(true)}
        onClose={() => {
          setTagDropdownOpen(false);
          setTagSearch('');
          setTagPage(1);
        }}
        displayEmpty
        renderValue={(selected) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(selected as string[]).length > 0 ? (
              <Chip size="small" label={`${(selected as string[]).length} 个标签`} />
            ) : (
              <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>选择标签</span>
            )}
          </Box>
        )}
        sx={{
          width: 140,
          height: 36,
          '& .MuiSelect-select': {
            pt: 0,
            pb: 0,
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              '& .MuiList-root': { p: 0 },
              maxHeight: 400,
            },
          },
        }}
      >
        {/* 标签搜索 */}
        <Box sx={{ p: 1, borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
          <TextField
            size="small"
            placeholder="搜索标签..."
            value={tagSearch}
            onChange={(e) => {
              setTagSearch(e.target.value);
              setTagPage(1);
            }}
            autoFocus={tagDropdownOpen}
            fullWidth
            onClick={(e) => e.stopPropagation()}
          />
        </Box>

        {/* 标签列表 */}
        {loadingTags ? (
          <MenuItem disabled>加载中...</MenuItem>
        ) : filteredTags.length === 0 ? (
          <MenuItem disabled>无匹配标签</MenuItem>
        ) : (
          <>
            {paginatedTags.map((tag) => (
              <MenuItem
                key={tag.id}
                value={tag.id}
                onClick={() => handleTagClick(tag.id)}
              >
                <Checkbox
                  checked={selectedTags.includes(tag.id)}
                  size="small"
                  sx={{ mr: 1 }}
                />
                {tag.tag_name}
              </MenuItem>
            ))}
            {hasMoreTags && (
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setTagPage(p => p + 1);
                }}
                sx={{ justifyContent: 'center' }}
              >
                <Button size="small" sx={{ textTransform: 'none' }}>
                  加载更多 ({filteredTags.length - paginatedTags.length} 条)
                </Button>
              </MenuItem>
            )}
          </>
        )}
      </Select>

      {/* 演员单选下拉框 */}
      <Select
        size="small"
        value={selectedActor || ''}
        onOpen={() => setActorDropdownOpen(true)}
        onClose={() => {
          setActorDropdownOpen(false);
          setActorSearch('');
          setActorPage(1);
        }}
        displayEmpty
        renderValue={(selected) => {
          if (!selected) {
            return <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>选择演员</span>;
          }
          const actor = actors.find(a => a.id === selected);
          return actor?.name || selected;
        }}
        sx={{
          width: 140,
          height: 36,
          '& .MuiSelect-select': {
            pt: 0,
            pb: 0,
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              '& .MuiList-root': { p: 0 },
              maxHeight: 400,
            },
          },
        }}
      >
        {/* 演员搜索 */}
        <Box sx={{ p: 1, borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
          <TextField
            size="small"
            placeholder="搜索演员..."
            value={actorSearch}
            onChange={(e) => {
              setActorSearch(e.target.value);
              setActorPage(1);
            }}
            autoFocus={actorDropdownOpen}
            fullWidth
            onClick={(e) => e.stopPropagation()}
          />
        </Box>

        {/* 演员列表 */}
        {loadingActors ? (
          <MenuItem disabled>加载中...</MenuItem>
        ) : filteredActors.length === 0 ? (
          <MenuItem disabled>无匹配演员</MenuItem>
        ) : (
          <>
            {paginatedActors.map((actor) => (
              <MenuItem
                key={actor.id}
                value={actor.id}
                onClick={() => onActorChange(actor.id)}
              >
                {actor.name}
              </MenuItem>
            ))}
            {hasMoreActors && (
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setActorPage(p => p + 1);
                }}
                sx={{ justifyContent: 'center' }}
              >
                <Button size="small" sx={{ textTransform: 'none' }}>
                  加载更多 ({filteredActors.length - paginatedActors.length} 条)
                </Button>
              </MenuItem>
            )}
          </>
        )}
      </Select>

      {/* 排序控件组 */}
      <Box sx={{ display: 'flex', alignItems: 'center', height: 36 }}>
        {/* 排序下拉框 */}
        <Select
          size="small"
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value)}
          sx={{
            width: 120,
            height: 36,
            '& .MuiSelect-select': {
              pt: 0,
              pb: 0,
            },
            '& .MuiOutlinedInput-root': {
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            },
          }}
        >
          {sortOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>

        {/* 排序顺序按钮 */}
        <Tooltip title={sortOrder === 'asc' ? '升序' : '降序'}>
          <IconButton
            onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
            size="small"
            sx={{
              height: 36,
              width: 36,
              borderRadius: '0 4px 4px 0',
              border: '1px solid',
              borderColor: 'divider',
              borderLeft: 'none',
            }}
          >
            {sortOrder === 'asc' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* 卡片大小切换 */}
      <Tooltip title="卡片大小">
        <ToggleButtonGroup
          value={cardSize}
          exclusive
          onChange={(_, newValue) => {
            if (newValue) onCardSizeChange(newValue);
          }}
          size="small"
          sx={{
            height: 36,
            '& .MuiToggleButton-root': {
              padding: '6px 10px',
              height: 36,
            },
          }}
        >
          {cardSizeOptions.map((option) => (
            <ToggleButton key={option.value} value={option.value} aria-label={option.label}>
              {option.icon}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Tooltip>
    </FilterBar>
  );
}
