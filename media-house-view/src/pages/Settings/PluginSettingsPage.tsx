import { useState, useEffect, useRef } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  Chip,
  Tooltip,
  LinearProgress,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Upload as UploadIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Cancel as CancelIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { api } from '../../services/api';
import { PluginCard } from '../../components/PluginCard';
import { PluginConfigDialog } from '../../components/PluginConfigDialog';
import { PluginTestRunDialog } from '../../components/PluginTestRunDialog';
import { PluginWizardDialog } from '../../components/PluginWizardDialog';
import type { Plugin, PluginConfig, PluginExecutionLog } from '../../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

const STATUS_COLORS = {
  pending: 'default',
  running: 'info',
  success: 'success',
  failed: 'error',
  timeout: 'warning',
} as const;

const STATUS_LABELS = {
  pending: '等待中',
  running: '运行中',
  success: '成功',
  failed: '失败',
  timeout: '超时',
} as const;

export function PluginSettingsPage() {
  // ========== Tab 切换状态 ==========
  const [mainTabValue, setMainTabValue] = useState(0);

  // ========== 插件列表状态 ==========
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 插件列表对话框状态
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);
  const [pluginToUninstall, setPluginToUninstall] = useState<Plugin | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingUploading, setUploadingUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 插件编写向导对话框状态
  const [wizardDialogOpen, setWizardDialogOpen] = useState(false);

  // 测试运行对话框状态
  const [testRunDialogOpen, setTestRunDialogOpen] = useState(false);
  const [pluginToTest, setPluginToTest] = useState<Plugin | null>(null);
  const [executing, setExecuting] = useState(false);

  // ========== 插件配置状态 ==========
  const [configs, setConfigs] = useState<PluginConfig[]>([]);
  const [configDialogOpen2, setConfigDialogOpen2] = useState(false);
  const [configDialogMode, setConfigDialogMode] = useState<'create' | 'edit'>('create');
  const [editingConfig, setEditingConfig] = useState<PluginConfig | null>(null);
  const [deleteConfigDialogOpen, setDeleteConfigDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<PluginConfig | null>(null);
  const [configFormData, setConfigFormData] = useState({
    plugin_key: '',
    config_name: '',
    config_data: '',
    is_active: true,
  });

  // ========== 插件日志状态 ==========
  const [logs, setLogs] = useState<PluginExecutionLog[]>([]);
  const [logDetailDialogOpen, setLogDetailDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<PluginExecutionLog | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  // 自动刷新定时器
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentPluginKeyRef = useRef<string | null>(null);

  // ========== 公共方法 ==========
  const refreshPlugins = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPlugins();
      setPlugins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  };

  const loadConfigs = async (pluginKey: string) => {
    try {
      const data = await api.getPluginConfigs(pluginKey);
      setConfigs(data);
    } catch (err) {
      console.error('Failed to load configs:', err);
    }
  };

  const refreshLogs = async (pluginKey: string) => {
    try {
      setLogsLoading(true);
      const data = await api.getPluginExecutionLogs(pluginKey);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    refreshPlugins();
  }, []);

  // ========== 自动刷新逻辑 ==========
  useEffect(() => {
    // 清除之前的定时器
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // 只在日志 Tab 时启用自动刷新
    if (mainTabValue !== 2) return;

    // 检查是否有运行中的任务
    const hasRunningTask = logs.some(log => log.status === 'running');

    if (hasRunningTask && plugins.length > 0) {
      // 获取当前选中的插件 key
      const pluginKey = plugins[0]?.plugin_key;
      if (!pluginKey) return;

      currentPluginKeyRef.current = pluginKey;

      // 启动定时器，每 3 秒刷新一次
      refreshIntervalRef.current = setInterval(() => {
        refreshLogs(pluginKey);
      }, 3000);
    }
  }, [mainTabValue, logs, plugins]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // ========== 插件列表相关 ==========
  const handleOpenConfigDialog = (plugin: Plugin) => {
    setSelectedPlugin(plugin);
    setConfigDialogOpen(true);
  };

  const handleCloseConfigDialog = () => {
    setConfigDialogOpen(false);
    setSelectedPlugin(null);
  };

  const handleSaveConfig = async (configName: string, configData: Record<string, any>) => {
    if (!selectedPlugin) return;

    try {
      await api.createPluginConfig(selectedPlugin.plugin_key, {
        plugin_version: selectedPlugin.version,
        config_name: configName,
        config_data: configData,
        is_active: true,
      });
      setUploadMessage({ type: 'success', message: '配置保存成功' });
    } catch (err) {
      console.error('Failed to save config:', err);
      setUploadMessage({ type: 'error', message: '配置保存失败' });
    }
  };

  const handleToggleEnable = async (plugin: Plugin, enabled: boolean) => {
    try {
      await api.updatePlugin(plugin.plugin_key, plugin.version, { is_enabled: enabled });
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, is_enabled: enabled } : p))
      );
    } catch (err) {
      console.error('Failed to toggle plugin:', err);
    }
  };

  const handleUninstall = (plugin: Plugin) => {
    setPluginToUninstall(plugin);
    setUninstallDialogOpen(true);
  };

  const handleConfirmUninstall = async () => {
    if (!pluginToUninstall) return;

    try {
      await api.uninstallPlugin(pluginToUninstall.plugin_key, pluginToUninstall.version);
      setUninstallDialogOpen(false);
      setPluginToUninstall(null);
      refreshPlugins();
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
    }
  };

  const handleCancelUninstall = () => {
    setUninstallDialogOpen(false);
    setPluginToUninstall(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingUploading(true);
      setError(null);
      await api.installPlugin(file);
      setUploadMessage({ type: 'success', message: '插件安装成功' });
      refreshPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install plugin');
      setUploadMessage({ type: 'error', message: '插件安装失败' });
    } finally {
      setUploadingUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // ========== 测试运行相关 ==========
  const handleOpenTestRunDialog = (plugin: Plugin) => {
    setPluginToTest(plugin);
    setTestRunDialogOpen(true);
  };

  const handleCloseTestRunDialog = () => {
    setTestRunDialogOpen(false);
    setPluginToTest(null);
  };

  const handleTestRunExecute = async (sourceDir: string, outputDir: string, configName?: string) => {
    if (!pluginToTest) return;

    try {
      setExecuting(true);
      setError(null);
      await api.executePlugin(pluginToTest.plugin_key, {
        plugin_version: pluginToTest.version,
        source_dir: sourceDir,
        output_dir: outputDir,
        config_name: configName,
      });
      setUploadMessage({ type: 'success', message: '插件执行已启动' });
      setTestRunDialogOpen(false);
      setPluginToTest(null);
      // 切换到日志 tab 并刷新
      setMainTabValue(2);
      if (pluginToTest) {
        refreshLogs(pluginToTest.plugin_key);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '插件执行失败');
    } finally {
      setExecuting(false);
    }
  };

  // ========== 插件配置相关 ==========
  const handleOpenCreateConfigDialog = () => {
    if (plugins.length === 0) {
      setError('请先安装插件');
      return;
    }
    setConfigDialogMode('create');
    setEditingConfig(null);
    setConfigFormData({
      plugin_key: plugins[0].plugin_key,
      config_name: '',
      config_data: '{}',
      is_active: true,
    });
    setConfigDialogOpen2(true);
  };

  const handleOpenEditConfigDialog = (config: PluginConfig) => {
    setConfigDialogMode('edit');
    setEditingConfig(config);
    setConfigFormData({
      plugin_key: config.plugin_key,
      config_name: config.config_name,
      config_data: JSON.stringify(config.config_data, null, 2),
      is_active: config.is_active,
    });
    setConfigDialogOpen2(true);
  };

  const handleCloseConfigDialog2 = () => {
    setConfigDialogOpen2(false);
    setEditingConfig(null);
  };

  const handleConfigSubmit = async () => {
    try {
      setError(null);

      let configData: Record<string, any>;
      try {
        configData = JSON.parse(configFormData.config_data);
      } catch (err) {
        setError('配置数据格式错误，请输入有效的 JSON');
        return;
      }

      const dto = {
        config_name: configFormData.config_name,
        config_data: configData,
        is_active: configFormData.is_active,
      };

      if (configDialogMode === 'create') {
        await api.createPluginConfig(configFormData.plugin_key, dto);
      } else if (editingConfig) {
        await api.updatePluginConfig(editingConfig.plugin_key, editingConfig.id, dto);
      }

      setConfigDialogOpen2(false);
      loadConfigs(configFormData.plugin_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDeleteConfigConfirm = async () => {
    if (!configToDelete) return;

    try {
      await api.deletePluginConfig(configToDelete.plugin_key, configToDelete.id);
      setDeleteConfigDialogOpen(false);
      setConfigToDelete(null);
      loadConfigs(configToDelete.plugin_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleOpenDeleteConfigDialog = (config: PluginConfig) => {
    setConfigToDelete(config);
    setDeleteConfigDialogOpen(true);
  };

  // ========== 插件日志相关 ==========
  const handleCancelExecution = async (log: PluginExecutionLog) => {
    try {
      await api.cancelPluginExecution(log.id);
      if (plugins[mainTabValue]) {
        refreshLogs(plugins[mainTabValue].plugin_key);
      }
    } catch (err) {
      console.error('Failed to cancel execution:', err);
    }
  };

  const handleOpenLogDetail = (log: PluginExecutionLog) => {
    setSelectedLog(log);
    setLogDetailDialogOpen(true);
  };

  const handleCloseLogDetail = () => {
    setLogDetailDialogOpen(false);
    setSelectedLog(null);
  };

  const formatTime = (time: string) => {
    return new Date(time).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (loading) {
    return (
      <Container maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* 顶部栏 */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4">插件管理</Typography>
        {mainTabValue === 0 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={refreshPlugins} aria-label="刷新列表">
              <RefreshIcon />
            </IconButton>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setWizardDialogOpen(true)}
            >
              插件助手
            </Button>
            <Button
              variant="contained"
              startIcon={uploadingUploading ? <CircularProgress size={20} /> : <UploadIcon />}
              onClick={handleUploadClick}
              disabled={uploadingUploading}
            >
              {uploadingUploading ? '安装中...' : '安装插件'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tar.gz,.zip"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </Box>
        )}
        {mainTabValue === 1 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={() => plugins[0] && loadConfigs(plugins[0].plugin_key)} aria-label="刷新">
              <RefreshIcon />
            </IconButton>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateConfigDialog}>
              新建配置
            </Button>
          </Box>
        )}
        {mainTabValue === 2 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={() => plugins[0] && refreshLogs(plugins[0].plugin_key)} aria-label="刷新">
              <RefreshIcon />
            </IconButton>
          </Box>
        )}
      </Box>

      {/* 上传消息提示 */}
      {uploadMessage && (
        <Alert severity={uploadMessage.type} sx={{ mb: 3 }} onClose={() => setUploadMessage(null)}>
          {uploadMessage.message}
        </Alert>
      )}

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tab 切换 */}
      <Tabs
        value={mainTabValue}
        onChange={(_, v) => setMainTabValue(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="插件列表" />
        <Tab label="插件配置" />
        <Tab label="插件日志" />
      </Tabs>

      {/* Tab 1: 插件列表 */}
      <TabPanel value={mainTabValue} index={0}>
        {plugins.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              暂无插件
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              点击右上角"安装插件"按钮安装新的搜刮插件
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {plugins.map((plugin) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={`${plugin.id}-${plugin.version}`}>
                <PluginCard
                  plugin={plugin}
                  onToggleEnable={handleToggleEnable}
                  onConfig={handleOpenConfigDialog}
                  onTestRun={handleOpenTestRunDialog}
                  onUninstall={handleUninstall}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>

      {/* Tab 2: 插件配置 */}
      <TabPanel value={mainTabValue} index={1}>
        {plugins.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              暂无插件
            </Typography>
          </Box>
        ) : (
          <>
            <Tabs
              value={mainTabValue}
              sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
              variant="scrollable"
              scrollButtons="auto"
            >
              {plugins.map((plugin) => (
                <Tab key={plugin.plugin_key} label={`${plugin.name} (${plugin.version})`} onClick={() => loadConfigs(plugin.plugin_key)} />
              ))}
            </Tabs>
            {configs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="h6" color="text.secondary">
                  暂无配置
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  点击右上角"新建配置"按钮创建新的插件配置
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>配置名称</TableCell>
                      <TableCell>配置数据</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>创建时间</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {configs.map((config) => (
                      <TableRow key={config.id}>
                        <TableCell>{config.id}</TableCell>
                        <TableCell>{config.config_name}</TableCell>
                        <TableCell>
                          <Tooltip title={JSON.stringify(config.config_data, null, 2)}>
                            <Box
                              sx={{
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {JSON.stringify(config.config_data)}
                            </Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={config.is_active ? '启用' : '禁用'}
                            size="small"
                            color={config.is_active ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(config.create_time).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" color="primary" onClick={() => handleOpenEditConfigDialog(config)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => handleOpenDeleteConfigDialog(config)}>
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </TabPanel>

      {/* Tab 3: 插件日志 */}
      <TabPanel value={mainTabValue} index={2}>
        {plugins.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              暂无插件
            </Typography>
          </Box>
        ) : logsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Tabs
              value={mainTabValue}
              sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
              variant="scrollable"
              scrollButtons="auto"
            >
              {plugins.map((plugin) => (
                <Tab key={plugin.plugin_key} label={`${plugin.name} (${plugin.version})`} onClick={() => refreshLogs(plugin.plugin_key)} />
              ))}
            </Tabs>
            {logs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="h6" color="text.secondary">
                  暂无执行日志
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>状态</TableCell>
                      <TableCell>执行类型</TableCell>
                      <TableCell>进度</TableCell>
                      <TableCell>当前步骤</TableCell>
                      <TableCell>开始时间</TableCell>
                      <TableCell>时长</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} hover>
                        <TableCell>
                          <Chip label={STATUS_LABELS[log.status]} color={STATUS_COLORS[log.status]} size="small" />
                        </TableCell>
                        <TableCell>
                          {log.execution_type === 'manual' && '手动'}
                          {log.execution_type === 'auto' && '自动'}
                          {log.execution_type === 'batch' && '批量'}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress variant="determinate" value={log.progress_percent} sx={{ width: 80 }} />
                            <Typography variant="body2">{log.progress_percent}%</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>{log.current_step || '-'}</TableCell>
                        <TableCell>{formatTime(log.start_time)}</TableCell>
                        <TableCell>{log.duration_seconds ? `${log.duration_seconds}秒` : '-'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {log.status === 'running' && (
                              <IconButton size="small" onClick={() => handleCancelExecution(log)} aria-label="取消" color="error">
                                <CancelIcon />
                              </IconButton>
                            )}
                            <IconButton size="small" onClick={() => handleOpenLogDetail(log)} aria-label="查看详情">
                              <VisibilityIcon />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </TabPanel>

      {/* 插件列表配置对话框 */}
      <PluginConfigDialog
        open={configDialogOpen}
        plugin={selectedPlugin}
        onClose={handleCloseConfigDialog}
        onSave={handleSaveConfig}
      />

      {/* 插件列表卸载确认对话框 */}
      <Dialog open={uninstallDialogOpen} onClose={handleCancelUninstall} maxWidth="xs">
        <DialogTitle>确认卸载</DialogTitle>
        <DialogContent>
          <Typography>确定要卸载插件 "{pluginToUninstall?.name}" v{pluginToUninstall?.version} 吗？此操作不可撤销。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelUninstall}>取消</Button>
          <Button onClick={handleConfirmUninstall} color="error" variant="contained">卸载</Button>
        </DialogActions>
      </Dialog>

      {/* 测试运行对话框 */}
      <PluginTestRunDialog
        open={testRunDialogOpen}
        plugin={pluginToTest}
        configs={configs}
        onClose={handleCloseTestRunDialog}
        onExecute={handleTestRunExecute}
        executing={executing}
      />

      {/* 插件配置创建/编辑对话框 */}
      <Dialog open={configDialogOpen2} onClose={handleCloseConfigDialog2} maxWidth="md" fullWidth>
        <DialogTitle>{configDialogMode === 'create' ? '新建插件配置' : '编辑插件配置'}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            {configDialogMode === 'create' && (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>插件</InputLabel>
                <Select
                  value={configFormData.plugin_key}
                  label="插件"
                  onChange={(e) => setConfigFormData({ ...configFormData, plugin_key: e.target.value })}
                >
                  {plugins.map((plugin) => (
                    <MenuItem key={plugin.plugin_key} value={plugin.plugin_key}>
                      {plugin.name} ({plugin.version})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              fullWidth
              label="配置名称"
              value={configFormData.config_name}
              onChange={(e) => setConfigFormData({ ...configFormData, config_name: e.target.value })}
              sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="配置数据（JSON）"
              value={configFormData.config_data}
              onChange={(e) => setConfigFormData({ ...configFormData, config_data: e.target.value })}
              multiline
              rows={8}
              sx={{ mb: 2 }}
              error={!!error && error.includes('JSON')}
              helperText={error && error.includes('JSON') ? error : '请输入有效的 JSON 格式配置数据'}
              required
            />
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              <Typography sx={{ mr: 2 }}>启用状态</Typography>
              <Switch
                checked={configFormData.is_active}
                onChange={(e) => setConfigFormData({ ...configFormData, is_active: e.target.checked })}
                color="primary"
              />
              <Typography sx={{ ml: 1 }}>{configFormData.is_active ? '启用' : '禁用'}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfigDialog2}>取消</Button>
          <Button onClick={handleConfigSubmit} variant="contained">{configDialogMode === 'create' ? '创建' : '保存'}</Button>
        </DialogActions>
      </Dialog>

      {/* 插件配置删除确认对话框 */}
      <Dialog
        open={deleteConfigDialogOpen}
        onClose={() => { setDeleteConfigDialogOpen(false); setConfigToDelete(null); }}
        maxWidth="xs"
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>确定要删除配置 "{configToDelete?.config_name}" 吗？此操作不可撤销。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteConfigDialogOpen(false); setConfigToDelete(null); }}>取消</Button>
          <Button onClick={handleDeleteConfigConfirm} color="error" variant="contained">删除</Button>
        </DialogActions>
      </Dialog>

      {/* 插件日志详情对话框 */}
      <Dialog open={logDetailDialogOpen} onClose={handleCloseLogDetail} maxWidth="md" fullWidth>
        <DialogTitle>执行日志详情</DialogTitle>
        <DialogContent>
          {selectedLog && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>基本信息</Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">插件ID: {selectedLog.plugin_key}</Typography>
                <Typography variant="body2">版本: {selectedLog.plugin_version || '-'}</Typography>
                <Typography variant="body2">执行类型: {
                  selectedLog.execution_type === 'manual' ? '手动' :
                  selectedLog.execution_type === 'auto' ? '自动' :
                  selectedLog.execution_type === 'batch' ? '批量' : '-'
                }</Typography>
                {selectedLog.media_id && <Typography variant="body2">媒体ID: {selectedLog.media_id}</Typography>}
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>执行信息</Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">状态: {STATUS_LABELS[selectedLog.status]}</Typography>
                <Typography variant="body2">进度: {selectedLog.progress_percent}%</Typography>
                <Typography variant="body2">当前步骤: {selectedLog.current_step || '-'}</Typography>
                <Typography variant="body2">开始时间: {formatTime(selectedLog.start_time)}</Typography>
                {selectedLog.end_time && <Typography variant="body2">结束时间: {formatTime(selectedLog.end_time)}</Typography>}
                {selectedLog.duration_seconds && <Typography variant="body2">执行时长: {selectedLog.duration_seconds}秒</Typography>}
              </Box>
              {selectedLog.error_message && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" gutterBottom color="error">错误信息</Typography>
                  <Box sx={{ mb: 2 }}>
                    {selectedLog.error_message.split('\n').map((line, idx) => (
                      <Typography key={idx} variant="body2" color="error" sx={{ mb: 0.5 }}>
                        {line}
                      </Typography>
                    ))}
                  </Box>
                </>
              )}
              {selectedLog.metadata_output && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" gutterBottom>元数据输出</Typography>
                  <Typography
                    variant="body2"
                    sx={{ mt: 1, p: 2, bgcolor: 'background.paper', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.875rem', overflow: 'auto', maxHeight: 200 }}
                  >
                    {JSON.stringify(selectedLog.metadata_output, null, 2)}
                  </Typography>
                </>
              )}
              {selectedLog.log_messages && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" gutterBottom>执行日志</Typography>
                  <Box
                    sx={{ mt: 1, p: 2, bgcolor: 'background.paper', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.875rem', overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap' }}
                  >
                    {selectedLog.log_messages.split('\n').map((line, idx) => (
                      <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
                        {line}
                      </Typography>
                    ))}
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseLogDetail}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 插件编写向导对话框 */}
      <PluginWizardDialog
        open={wizardDialogOpen}
        onClose={() => setWizardDialogOpen(false)}
      />
    </Container>
  );
}
