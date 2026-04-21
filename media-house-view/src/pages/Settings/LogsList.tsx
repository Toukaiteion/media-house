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
  const [firstLogId, setFirstLogId] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  let refreshTimerRef: number = 0;

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  const fetchLogs = async (page = 1, append = false, initial = false) => {
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
        // append 模式：旧日志（页数更大的）追加到前面
        setLogs(prev => [...response.items, ...prev]);
      } {
        setLogs(response.items);
      }

      setTotalCount(response.total_count);
      setHasMore(page < response.total_pages);

      if (response.items.length > 0) {
        // 记录最新的日志 ID（items[0] 是最新的）
        const latestId = response.items[0]?.id;
        if (latestId && (!lastLogId || latestId > lastLogId)) {
          setLastLogId(latestId);
        }

        // 记录最旧的日志 ID（items[items.length - 1] 是最旧的）
        const oldestId = response.items[response.items.length - 1]?.id;
        if (oldestId && (!firstLogId || oldestId < firstLogId)) {
          setFirstLogId(oldestId);
        }
      }

      if (initial) {
        // 初次加载完成后，稍后滚动到底部
        setTimeout(scrollToBottom, 100);
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
    await fetchLogs(1, false, true);
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
        // 新日志追加到数组末尾（因为后面会 reverse 渲染）
        setLogs(prev => [...prev, ...newLogs]);
        setLastLogId(response.items[0].id);

        // 新日志到达时滚动到底部
        setTimeout(scrollToBottom, 100);
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
    const { scrollTop } = target;

    // 滚动到顶部时加载更多历史日志
    if (scrollTop === 0 && hasMore && !loading) {
      loadMore();
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
                向下滚动加载更多
              </Typography>
            </Box>
          )}

          {loading && logs.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {/* 倒序渲染：新日志在底部 */}
          {[...logs].reverse().map((log, index) => (
            <LogEntryItem key={log.id} log={log} index={index} />
          ))}

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
