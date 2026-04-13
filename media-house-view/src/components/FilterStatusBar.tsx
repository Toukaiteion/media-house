import { Box, Chip, IconButton, styled, alpha } from '@mui/material';
import { ClearAll as ClearAllIcon, Delete as DeleteIcon } from '@mui/icons-material';
import type { Tag, Actor } from '../types';

interface FilterStatusBarProps {
  selectedTags: string[];
  selectedActor?: string | null;
  searchValue: string;
  tags: Tag[];
  actors: Actor[];
  onRemoveTag?: (tagId: string) => void;
  onRemoveActor?: () => void;
  onRemoveSearch?: () => void;
  onClearAll?: () => void;
}

const StatusBar = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark'
    ? alpha(theme.palette.background.paper, 0.5)
    : alpha(theme.palette.background.paper, 0.8),
  borderBottom: `1px solid ${theme.palette.divider}`,
  padding: '8px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
}));

const Section = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  flexWrap: 'wrap',
}));

export function FilterStatusBar({
  selectedTags,
  selectedActor,
  searchValue,
  tags,
  actors,
  onRemoveTag,
  onRemoveActor,
  onRemoveSearch,
  onClearAll,
}: FilterStatusBarProps) {
  // 计算是否有任何筛选条件
  const hasFilters = selectedTags.length > 0 || selectedActor || searchValue;

  // 获取选中的标签对象
  const selectedTagObjects = selectedTags
    .map(tagId => tags.find(t => t.id === tagId))
    .filter(Boolean) as Tag[];

  // 获取选中的演员对象
  const selectedActorObject = selectedActor
    ? actors.find(a => a.id === selectedActor)
    : null;

  // 判断是否需要显示"清除全部"按钮
  const showClearAll = hasFilters;

  if (!hasFilters) {
    return null;
  }

  return (
    <StatusBar>
      {/* 筛选条件模块 */}
      <Section>
        {/* 已选标签 */}
        {selectedTagObjects.map(tag => (
            <Chip
              key={tag.id}
              size="small"
              label={tag.tag_name}
              variant="outlined"
              deleteIcon={<DeleteIcon fontSize="small" />}
              onDelete={() => onRemoveTag?.(tag.id)}
              sx={{
                borderColor: 'divider',
                '& .MuiChip-deleteIcon': {
                  fontSize: '16px',
                },
              }}
            />
          ))}

          {/* 已选演员 */}
          {selectedActorObject && (
            <Chip
              size="small"
              label={selectedActorObject.name}
              variant="outlined"
              deleteIcon={<DeleteIcon fontSize="small" />}
              onDelete={onRemoveActor}
              sx={{
                borderColor: 'divider',
                '& .MuiChip-deleteIcon': {
                  fontSize: '16px',
                },
              }}
            />
          )}

          {/* 搜索关键字 */}
          {searchValue && (
            <Chip
              size="small"
              label={`搜索: ${searchValue}`}
              variant="outlined"
              deleteIcon={<DeleteIcon fontSize="small" />}
              onDelete={onRemoveSearch}
              sx={{
                borderColor: 'divider',
                '& .MuiChip-deleteIcon': {
                  fontSize: '16px',
                },
              }}
            />
          )}

          {/* 清除全部按钮 */}
          {showClearAll && onClearAll && (
            <IconButton
              size="small"
              onClick={onClearAll}
              sx={{
                ml: 1,
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: alpha('#000000', 0.04),
                },
              }}
              title="清除全部"
            >
              <ClearAllIcon fontSize="small" />
            </IconButton>
          )}
        </Section>
    </StatusBar>
  );
}
