import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  IconButton,
  Alert,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { api } from '../../services/api';
import { LibraryCard } from '../../components/LibraryCard';
import type { MediaLibrary, UpdateMediaLibraryDto, PluginGrouped, PluginConfig } from '../../types';

export function MediaLibrarySettingsPage() {
  // 库列表状态
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedLibrary, setSelectedLibrary] = useState<MediaLibrary | null>(null);

  // 删除确认对话框
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [libraryToDelete, setLibraryToDelete] = useState<MediaLibrary | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    type: 'Movie' as 'Movie' | 'TVShow',
    path: '',
    isEnabled: true,
    pluginId: undefined as number | undefined,
    pluginConfigId: undefined as number | undefined,
    pluginKey: undefined as string | undefined,
  });

  // 扫描状态提示
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 插件相关状态
  const [_, setPluginsGrouped] = useState<PluginGrouped[]>([]);
  const [pluginConfigs, setPluginConfigs] = useState<PluginConfig[]>([]);
  const [loadingPlugins, setLoadingPlugins] = useState(false);

  // 展平后的插件选项（用于下拉菜单）
  interface PluginOption {
    id: number;
    pluginKey: string;
    version: string;
    name: string;
  }
  const [pluginOptions, setPluginOptions] = useState<PluginOption[]>([]);

  // 刷新库列表
  const refreshLibraries = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getLibraries();
      setLibraries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load libraries');
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    refreshLibraries();
    loadPluginsGrouped();
  }, []);

  // 加载插件分组列表
  const loadPluginsGrouped = async () => {
    try {
      setLoadingPlugins(true);
      const data = await api.getPluginsGrouped();
      setPluginsGrouped(data);

      // 展平插件选项用于下拉菜单
      const options: PluginOption[] = [];
      data.forEach((plugin) => {
        plugin.versions.forEach((version) => {
          options.push({
            id: version.id,
            pluginKey: plugin.pluginKey,
            version: version.version,
            name: plugin.name,
          });
        });
      });
      setPluginOptions(options);
    } catch (err) {
      console.error('Failed to load plugins:', err);
    } finally {
      setLoadingPlugins(false);
    }
  };

  // 当插件选择改变时，加载对应的配置
  useEffect(() => {
    const loadPluginConfigs = async () => {
      if (formData.pluginKey) {
        try {
          const configs = await api.getPluginConfigs(formData.pluginKey);
          setPluginConfigs(configs);
        } catch (err) {
          console.error('Failed to load plugin configs:', err);
          setPluginConfigs([]);
        }
      } else {
        setPluginConfigs([]);
      }
    };

    loadPluginConfigs();
  }, [formData.pluginKey]);

  // 打开添加库对话框
  const handleOpenCreateDialog = () => {
    setDialogMode('create');
    setFormData({
      name: '',
      type: 'Movie',
      path: '',
      isEnabled: true,
      pluginId: undefined,
      pluginConfigId: undefined,
      pluginKey: undefined,
    });
    setPluginConfigs([]);
    setDialogOpen(true);
  };

  // 打开编辑库对话框
  const handleOpenEditDialog = (library: MediaLibrary) => {
    setDialogMode('edit');
    setSelectedLibrary(library);
    setFormData({
    name: library.name,
      type: library.type,
      path: library.path,
      isEnabled: library.isEnabled,
      pluginId: library.plugin_id,
      pluginConfigId: library.plugin_config_id,
      pluginKey: undefined,
    });
    setDialogOpen(true);

    // 如果已选择插件，加载对应的配置
    if (library.plugin_id) {
      const selectedOption = pluginOptions.find(p => p.id === library.plugin_id);
      if (selectedOption) {
        setFormData(prev => ({ ...prev, pluginKey: selectedOption.pluginKey }));
        api.getPluginConfigs(selectedOption.pluginKey)
          .then(configs => setPluginConfigs(configs))
          .catch(err => {
            console.error('Failed to load plugin configs:', err);
            setPluginConfigs([]);
          });
      }
    } else {
      setPluginConfigs([]);
    }
  };

  // 关闭对话框
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedLibrary(null);
  };

  // 处理创建库
  const handleCreate = async () => {
    if (!formData.name || !formData.path) {
      return;
    }

    try {
      await api.createLibrary({
        name: formData.name,
        type: formData.type,
        path: formData.path,
        plugin_id: formData.pluginId,
        plugin_config_id: formData.pluginConfigId,
      });
      setDialogOpen(false);
      refreshLibraries();
    } catch (err) {
      console.error('Failed to create library:', err);
    }
  };

  // 处理更新库
  const handleUpdate = async () => {
    if (!selectedLibrary || !formData.name || !formData.path) {
      return;
    }

    try {
      const updateDto: UpdateMediaLibraryDto = {
        name: formData.name,
        type: formData.type,
        path: formData.path,
        isEnabled: formData.isEnabled,
        plugin_id: formData.pluginId,
        plugin_config_id: formData.pluginConfigId,
      };
      await api.updateLibrary(selectedLibrary.id, updateDto);
      setDialogOpen(false);
      setSelectedLibrary(null);
      refreshLibraries();
    } catch (err) {
      console.error('Failed to update library:', err);
    }
  };

  // 处理删除确认
  const handleDelete = (library: MediaLibrary) => {
    setLibraryToDelete(library);
    setDeleteDialogOpen(true);
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    if (!libraryToDelete) {
      return;
    }

    try {
      await api.deleteLibrary(libraryToDelete.id);
      setDeleteDialogOpen(false);
      setLibraryToDelete(null);
      refreshLibraries();
    } catch (err) {
      console.error('Failed to delete library:', err);
    }
  };

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setLibraryToDelete(null);
  };

  // 处理刷新/扫描
  const handleRefresh = async (library: MediaLibrary) => {
    try {
      await api.triggerScan(library.id, 'full');
      setScanMessage({ type: 'success', message: `已开始全量扫描 "${library.name}"` });
      refreshLibraries();
    } catch (err) {
      console.error('Failed to scan library:', err);
      setScanMessage({ type: 'error', message: `全量扫描 "${library.name}" 失败` });
    }
  };

  // 处理增量扫描
  const handleIncrementalScan = async (library: MediaLibrary) => {
    try {
      await api.triggerScan(library.id, 'incremental');
      setScanMessage({ type: 'success', message: `已开始增量扫描 "${library.name}"` });
      refreshLibraries();
    } catch (err) {
      console.error('Failed to incremental scan library:', err);
      setScanMessage({ type: 'error', message: `增量扫描 "${library.name}" 失败` });
    }
    };

  // 清除扫描消息
  const handleClearScanMessage = () => {
    setScanMessage(null);
  };

  if (loading) {
    return (
      <Container maxWidth="xl">
        <Typography variant="h6">Loading...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl">
        <Typography variant="h6" color="error">{error}</Typography>
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
        <Typography variant="h4">媒体库管理</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={refreshLibraries} aria-label="刷新列表">
            <RefreshIcon />
          </IconButton>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateDialog}>
            添加库
          </Button>
        </Box>
      </Box>

      {/* 扫描消息提示 */}
      {scanMessage && (
        <Alert
          severity={scanMessage.type}
          sx={{ mb: 3 }}
          onClose={handleClearScanMessage}
        >
          {scanMessage.message}
        </Alert>
      )}

      {/* 库列表 */}
      <Grid container spacing={3}>
        {libraries.map((library) => (
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={library.id}>
            <LibraryCard
                library={library}
                onEdit={handleOpenEditDialog}
                onRefresh={handleRefresh}
                onIncrementalScan={handleIncrementalScan}
                onDelete={handleDelete}
            />
          </Grid>
        ))}
      </Grid>

      {/* 添加/编辑对话框 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{dialogMode === 'create' ? '添加媒体库' : '编辑媒体库'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="库名称"
            fullWidth
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>库类型</InputLabel>
            <Select
              value={formData.type}
              label="库类型"
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'Movie' | 'TVShow' })}
            >
              <MenuItem value="Movie">电影</MenuItem>
              <MenuItem value="TVShow">电视剧</MenuItem>
            </Select>
          </FormControl>
          <TextField
            margin="dense"
            label="库路径"
            fullWidth
            value={formData.path}
            onChange={(e) => setFormData({ ...formData, path: e.target.value })}
            helperText="媒体文件夹的绝对路径"
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>元数据插件</InputLabel>
            <Select
              value={formData.pluginId || ''}
              label="元数据插件"
              onChange={(e) => {
                const value = e.target.value ? Number(e.target.value) : undefined;
                const selectedOption = pluginOptions.find(p => p.id === value);
                setFormData({
                  ...formData,
                  pluginId: value,
                  pluginKey: selectedOption?.pluginKey,
                  pluginConfigId: undefined, // Reset config when plugin changes
                });
              }}
              disabled={loadingPlugins}
            >
              <MenuItem value="">
                <em>不使用插件</em>
              </MenuItem>
              {pluginOptions.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.name} v{option.version}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {formData.pluginId && (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>插件配置</InputLabel>
              <Select
                value={formData.pluginConfigId || ''}
                label="插件配置"
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    pluginConfigId: e.target.value ? Number(e.target.value) : undefined,
                  });
                }}
              >
                <MenuItem value="">
                  <em>不使用配置</em>
                </MenuItem>
                {pluginConfigs.map((config) => (
                  <MenuItem key={config.id} value={config.id}>
                    {config.config_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {dialogMode === 'edit' && (
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isEnabled}
                  onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
                />
              }
              label="启用此库"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button
            onClick={dialogMode === 'create' ? handleCreate : handleUpdate}
            variant="contained"
            disabled={!formData.name || !formData.path}
          >
            {dialogMode === 'create' ? '创建' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={handleCancelDelete} maxWidth="xs">
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除媒体库 "{libraryToDelete?.name}" 吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>取消</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
