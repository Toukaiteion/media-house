import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { LogEntryItem } from './LogEntryItem';
import { api } from '../../services/api';
import { type LogEntry, type LogsPageResponse, type LogsQueryParams } from '../../types';

interface LogsListProps {
  filters: LogsQueryParams;
  autoRefresh?: boolean;
  refreshInterval?: number;
  newLogsCallback?: (count: number) => void;
}

const DEFAULT_PAGE_SIZE = 50;

export function LogsList({
  filters,
  autoRefresh = true,
  refreshInterval = 5000,
  newLogsCallback
}: LogsListProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [lastLogId, setLastLogId] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  let refreshTimerRef: number = 0;

  const fetchLogs = async (page = 1, append = false) => {
    try {
      setLoading(true);
      setError(null);

      const response: LogsPageResponse = await api.getLogs({
        ...filters,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        sortOrder: 'desc'
      });

      if (append) {
        setLogs(prev => [...response.items, ...prev]);
      } else {
        setLogs(response.items);
      }

      setTotalCount(response.total_count);
      setHasMore(page < response.total_pages);
      setLastLogId(response.items[0]?.id || null);

      if (newLogsCallback && lastLogId && response.items[0]?.id > lastLogId) {
        newLogsCallback(response.items[0].id - lastLogId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取日志失败');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    const currentPage = Math.floor(logs.length / DEFAULT_PAGE_SIZE) + 1;
    fetchLogs(currentPage, true);
  };

  const refresh = async () => {
    await fetchLogs(1, false);
  };

  const checkForNewLogs = async () => {
    try {
      const response: LogsPageResponse = await api.getLogs({
        ...filters,
        page: 1,
        pageSize: 10,
        sortOrder: 'desc'
      });

      if (response.items.length > 0 && lastLogId && response.items[0].id > lastLogId) {
        const newCount = response.items[0].id - lastLogId;
        if (newLogsCallback) {
          newLogsCallback(newCount);
        }

        const newLogs = response.items.filter(log => log.id > (lastLogId || 0));
        setLogs(prev => [...newLogs, ...prev]);
        setLastLogId(response.items[0].id);
      }
    } catch (err) {
      console.error('检查新日志失败:', err);
    }
  };

  useEffect(() => {
    refresh();

    if (autoRefresh) {
      refreshTimerRef = setInterval(checkForNewLogs, refreshInterval);
    }

    return () => {
      if (refreshTimerRef) {
        clearInterval(refreshTimerRef);
      }
    };
  }, [filters, autoRefresh, refreshInterval]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;

    if (scrollTop > 0 && hasMore && !loading) {
      const threshold = 100;
      if (scrollHeight - scrollTop - clientHeight < threshold) {
        loadMore();
      }
    }
  };

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box
      ref={scrollContainerRef}
      onScroll={handleScroll}
      sx={{
        flex: 1,
        overflowY: 'auto',
        px: 2
      }}
    >
      {logs.length === 0 && !loading ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'text.secondary'
          }}
        >
          <Typography variant="body1">暂无日志记录</Typography>
        </Box>
      ) : (
        <>
          {hasMore && !loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <Typography variant="body2" color="text.secondary">
                向上滚动加载更多
              </Typography>
            </Box>
          )}

          {logs.map((log, index) => (
            <LogEntryItem key={log.id} log={log} index={index} />
          ))}

          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {!hasMore && logs.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <Typography variant="body2" color="text.secondary">
                已显示全部 {totalCount} 条日志
              </Typography>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export { type LogsListProps };
