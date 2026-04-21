import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Stack,
  Typography,
  Paper,
  Snackbar,
  Alert as MuiAlert,
  Switch,
  FormControlLabel,
  Chip
} from '@mui/material';
import { LogsFilterBar } from './LogsFilterBar';
import { LogsList } from './LogsList';
import { api } from '../../services/api';
import { type LogsQueryParams, type LogsStats } from '../../types';

export function LogsManagerPage() {
  const [filters, setFilters] = useState<LogsQueryParams>({
    sortOrder: 'desc'
  });
  const [stats, setStats] = useState<LogsStats | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.getLogsStats();
      setStats(data);
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await loadStats();
    setLoading(false);
  };

  const handleClearFilters = () => {
    setFilters({
      sortOrder: 'desc'
    });
  };

  const handleFiltersChange = (newFilters: LogsQueryParams) => {
    setFilters(newFilters);
  };

  const handleNewLogs = (count: number) => {
    if (autoRefresh) {
      setNotification({
        open: true,
        message: `收到 ${count} 条新日志`,
        severity: 'success'
      });
      loadStats();
    }
  };

  const handleNotificationClose = () => {
    setNotification({ ...notification, open: false });
  };

  const getTotalLogs = () => {
    if (!stats) return 0;
    return Object.values(stats).reduce((sum, count) => sum + count, 0);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          系统日志
        </Typography>
        <Typography variant="body2" color="text.secondary">
          查看和管理系统运行日志，支持筛选、搜索和自动刷新
        </Typography>
      </Box>

      <LogsFilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onRefresh={handleRefresh}
        onClearFilters={handleClearFilters}
        stats={stats || undefined}
        loading={loading}
      />

      <Paper
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 400px)',
          minHeight: 400,
          overflow: 'hidden'
        }}
      >
        <Box sx={{ px: 2, py: 1, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography variant="subtitle2">
                日志列表
              </Typography>

              {stats && (
                <Stack direction="row" spacing={1}>
                  <Chip
                    label={`总计: ${getTotalLogs()}`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`Error: ${stats.Error}`}
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                  <Chip
                    label={`Warning: ${stats.Warning}`}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                  <Chip
                    label={`Info: ${stats.Information}`}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                  <Chip
                    label={`Debug: ${stats.Debug}`}
                    size="small"
                    color="default"
                    variant="outlined"
                  />
                </Stack>
              )}
            </Stack>

            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  size="small"
                />
              }
              label="自动刷新"
            />
          </Stack>
        </Box>

        <LogsList
          filters={filters}
          autoRefresh={autoRefresh}
          refreshInterval={5000}
          newLogsCallback={handleNewLogs}
        />
      </Paper>

      <Snackbar
        open={notification.open}
        autoHideDuration={3000}
        onClose={handleNotificationClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert
          onClose={handleNotificationClose}
          severity={notification.severity}
          variant="filled"
        >
          {notification.message}
        </MuiAlert>
      </Snackbar>
    </Container>
  );
}
