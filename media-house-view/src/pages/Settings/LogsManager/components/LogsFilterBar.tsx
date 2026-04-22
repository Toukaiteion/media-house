import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  IconButton,
  Stack,
  Typography,
  Tooltip
} from '@mui/material';
import { Search as SearchIcon, Clear as ClearIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { type LogLevel, type LogsQueryParams } from '../../../../types';
import { LOG_LEVELS } from '../constants';

interface LogsFilterBarProps {
  filters: LogsQueryParams;
  onFiltersChange: (filters: LogsQueryParams) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  loading?: boolean;
}

export function LogsFilterBar({
  filters,
  onFiltersChange,
  onRefresh,
  onClearFilters,
  loading
}: LogsFilterBarProps) {
  const hasActiveFilters = !!(
    filters.level ||
    filters.category ||
    filters.message ||
    filters.hasException ||
    filters.startTime ||
    filters.endTime
  );

  const handleLevelChange = (level: LogLevel | '') => {
    onFiltersChange({
      ...filters,
      level: level || undefined
    });
  };

  const handleMessageChange = (message: string) => {
    onFiltersChange({
      ...filters,
      message: message || undefined
    });
  };

  const handleHasExceptionToggle = () => {
    onFiltersChange({
      ...filters,
      hasException: filters.hasException ? undefined : true
    });
  };

  const handleStartTimeChange = (startTime: string) => {
    onFiltersChange({
      ...filters,
      startTime: startTime || undefined
    });
  };

  const handleEndTimeChange = (endTime: string) => {
    onFiltersChange({
      ...filters,
      endTime: endTime || undefined
    });
  };

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        p: 2,
        borderRadius: 1,
        mb: 2,
        boxShadow: 1
      }}
    >
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ flex: '0 0 auto' }}>
            筛选条件:
          </Typography>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>日志级别</InputLabel>
            <Select
              label="日志级别"
              value={filters.level || ''}
              onChange={(e) => handleLevelChange(e.target.value as LogLevel | '')}
            >
              <MenuItem value="">全部</MenuItem>
              {LOG_LEVELS.map((level) => (
                <MenuItem key={level} value={level}>
                  {level}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="搜索消息"
            value={filters.message || ''}
            onChange={(e) => handleMessageChange(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
            }}
            sx={{ minWidth: 250 }}
          />

          <TextField
            size="small"
            label="开始时间"
            type="datetime-local"
            value={filters.startTime?.slice(0, 16) || ''}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 220 }}
          />
          <TextField
            size="small"
            label="结束时间"
            type="datetime-local"
            value={filters.endTime?.slice(0, 16) || ''}
            onChange={(e) => handleEndTimeChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 220 }}
          />

          {hasActiveFilters && (
            <Tooltip title="清除筛选">
              <IconButton onClick={onClearFilters} size="small">
                <ClearIcon />
              </IconButton>
            </Tooltip>
          )}

          <Box sx={{ flex: 1 }} />

          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            disabled={loading}
            size="small"
          >
            刷新
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant={filters.hasException ? 'contained' : 'outlined'}
            color="error"
            size="small"
            onClick={handleHasExceptionToggle}
          >
            仅显示异常
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
