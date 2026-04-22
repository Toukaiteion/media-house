import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { LogEntryItem } from './LogEntryItem';
import { api } from '../../../../services/api';
import { type LogEntry, type LogsPageResponse, type LogsQueryParams } from '../../../../types';

export interface LogsListRef {
  refresh: () => Promise<void>;
}

interface LogsListProps {
  filters: LogsQueryParams;
  autoRefresh?: boolean;
  refreshInterval?: number;
  newLogsCallback?: (count: number) => void;
}

const DEFAULT_PAGE_SIZE = 50;

export const LogsList = forwardRef<LogsListRef, LogsListProps>((props, ref) => {
  const { filters, autoRefresh = false, refreshInterval = 5000, newLogsCallback } = props;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  let refreshTimerRef: number = 0;

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  const getMaxLogId = () => {
    if (logs.length === 0) return null;
    return Math.max(...logs.map(log => log.id));
  };

  const getMinLogId = () => {
    if (logs.length === 0) return null;
    return Math.min(...logs.map(log => log.id));
  };

  const fetchLogs = async (toId?: number, fromId?: number, pageSize?: number, preserveScrollHeight?: number) => {
    try {
      setLoading(true);
      setError(null);

      const response: LogsPageResponse = await api.getLogs({
        ...filters,
        toId,
        fromId,
        page: 1,
        pageSize,
        sortBy: 'id',
        sortOrder: fromId ? 'asc' : 'desc'
      });

      if (response.items.length > 0) {
        if (fromId) {
          // 使用 fromId 时，返回的是比 fromId 大的日志（新日志），追加到末尾
          response.items = response.items.reverse();
          setLogs(prev => [...response.items, ...prev]);
          // 新日志到达时滚动到底部
          setTimeout(scrollToBottom, 100);
        } else if (toId) {
          // 使用 toId 时，返回的是比 toId 小的日志（旧日志），追加到前面
          // 保存旧的 scrollHeight
          const oldScrollHeight = preserveScrollHeight || scrollContainerRef.current?.scrollHeight || 0;
          setLogs(prev => [...prev, ...response.items]);
          // 更新后调整 scrollTop，保持用户看到的内容在原位
          setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight - oldScrollHeight;
            }
          }, 0);
        } else {
          // 初次加载
          setLogs(response.items);
          setTimeout(scrollToBottom, 100);
        }

        // 判断是否还有更多日志
        setHasMore(response.items.length === (pageSize || DEFAULT_PAGE_SIZE));
      } else {
        // 没有新日志时，保持原状态
        if (fromId) {
          setHasMore(false);
        }
      }

      if (newLogsCallback && fromId && response.items.length > 0) {
        const maxId = getMaxLogId();
        const newMaxId = Math.max(...response.items.map(log => log.id));
        if (maxId && newMaxId > maxId) {
          newLogsCallback(newMaxId - maxId);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取日志失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载更早的日志（向上滚动时）
  const loadOlderLogs = () => {
    const minId = getMinLogId();
    if (minId === null || !hasMore || loading) return;
    const scrollHeight = scrollContainerRef.current?.scrollHeight || 0;
    fetchLogs(minId, undefined, 100, scrollHeight);
  };

  // 刷新：加载最新的日志
  const refresh = async () => {
    const maxId = getMaxLogId();
    // 使用 fromId 参数获取比当前最大 ID 更大的日志（新日志）
    await fetchLogs(undefined, maxId || undefined, 100);
  };

  // 检查新日志（自动刷新）
  const checkForNewLogs = async () => {
    const maxId = getMaxLogId();
    if (maxId === null) return;
    // 使用 fromId 参数获取新日志
    await fetchLogs(undefined, maxId, 100);
  };

  useEffect(() => {
    // 初次加载
    fetchLogs(undefined, undefined, DEFAULT_PAGE_SIZE);

    if (autoRefresh) {
      refreshTimerRef = setInterval(checkForNewLogs, refreshInterval);
    }

    return () => {
      if (refreshTimerRef) {
        clearInterval(refreshTimerRef);
      }
    };
  }, [filters, autoRefresh, refreshInterval]);

  useImperativeHandle(ref, () => ({
    refresh
  }));

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop } = target;

    // 滚动到顶部时加载更多历史日志
    if (scrollTop === 0) {
      loadOlderLogs();
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

          {loading && logs.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {/* 倒序渲染：新日志在底部 */}
          {[...logs].reverse().map((log, index) => (
            <LogEntryItem key={log.id} log={log} index={index} />
          ))}
        </>
      )}
    </Box>
  );
});

LogsList.displayName = 'LogsList';
