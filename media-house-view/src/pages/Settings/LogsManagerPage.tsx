import { useState, useEffect, useRef } from 'react';
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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { LogsFilterBar } from './LogsFilterBar';
import { LogsList, type LogsListRef } from './LogsList';
import { api } from '../../services/api';
import { type LogsQueryParams, type LogLevel, type LogLevelConfig } from '../../types';

const LOG_LEVELS: LogLevel[] = ['Debug', 'Information', 'Warning', 'Error', 'Fatal'];

export function LogsManagerPage() {
  const [filters, setFilters] = useState<LogsQueryParams>({
    sortOrder: 'desc'
  });
  const [logLevelConfig, setLogLevelConfig] = useState<LogLevelConfig | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | ''>('');
  const logsListRef = useRef<LogsListRef | null>(null);

  useEffect(() => {
    loadLogLevelConfig();
  }, []);

  const loadLogLevelConfig = async () => {
    try {
      const data = await api.getLogLevelConfig();
      setLogLevelConfig(data);
    } catch (err) {
      console.error('加载日志级别配置失败:', err);
    }
  };

  const handleOpenLevelDialog = () => {
    setSelectedLevel(logLevelConfig?.Default as LogLevel || '');
    setLevelDialogOpen(true);
  };

  const handleSetLogLevel = async () => {
    if (!selectedLevel) return;
    try {
      await api.setLogLevel(selectedLevel);
      setNotification({
        open: true,
        message: `日志级别已设置为 ${selectedLevel}`,
        severity: 'success'
      });
      await loadLogLevelConfig();
      setLevelDialogOpen(false);
    } catch (err) {
      setNotification({
        open: true,
        message: err instanceof Error ? err.message : '设置日志级别失败',
        severity: 'error'
      });
    }
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
    }
  };

  const handleNotificationClose = () => {
    setNotification({ ...notification, open: false });
  };

  const handleRefresh = async () => {
    if (logsListRef.current) {
      await logsListRef.current.refresh();
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            系统日志
          </Typography>
          <Typography variant="body2" color="text.secondary">
            查看和管理系统运行日志，支持筛选、搜索和自动刷新
          </Typography>
        </Box>
        {logLevelConfig && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              当前日志级别:
            </Typography>
            <Box
              component="span"
              sx={{
                px: 2,
                py: 0.5,
                border: '1px solid',
                borderColor: 'primary.main',
                borderRadius: 1,
                fontSize: '0.75rem'
              }}
            >
              {logLevelConfig.Default}
            </Box>
            <Button
              variant="outlined"
              size="small"
              onClick={handleOpenLevelDialog}
            >
              设置
            </Button>
          </Box>
        )}
      </Box>

      <LogsFilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onRefresh={handleRefresh}
        onClearFilters={handleClearFilters}
      />

      <Paper
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 300px)',
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
          ref={logsListRef}
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

      <Dialog
        open={levelDialogOpen}
        onClose={() => setLevelDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>设置日志级别</DialogTitle>
        <DialogContent>
          <FormControl fullWidth>
            <InputLabel>日志级别</InputLabel>
            <Select
              value={selectedLevel}
              label="日志级别"
              onChange={(e) => setSelectedLevel(e.target.value as LogLevel)}
            >
              {LOG_LEVELS.map((level) => (
                <MenuItem key={level} value={level}>
                  {level}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLevelDialogOpen(false)}>
            取消
          </Button>
          <Button
            onClick={handleSetLogLevel}
            variant="contained"
            disabled={!selectedLevel}
          >
            确定
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
