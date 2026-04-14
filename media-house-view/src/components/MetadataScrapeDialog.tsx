import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Divider,
  Chip,
} from '@mui/material';
import type { Plugin, PluginConfig, PluginExecutionLog } from '../types';
import { api } from '../services/api';

interface MetadataScrapeDialogProps {
  open: boolean;
  mediaTitle?: string;
  mediaYear?: number;
  plugins: Plugin[];
  pluginsConfig: Map<string, PluginConfig[]>;
  onClose: () => void;
  onApply: (metadata: Record<string, any>) => void;
}

export function MetadataScrapeDialog({
  open,
  mediaTitle,
  mediaYear,
  plugins,
  pluginsConfig,
  onClose,
  onApply,
}: MetadataScrapeDialogProps) {
  const [selectedPluginKey, setSelectedPluginKey] = useState('');
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [scrapeTitle, setScrapeTitle] = useState('');
  const [scrapeYear, setScrapeYear] = useState('');

  const [executing, setExecuting] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<PluginExecutionLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 初始化表单
  useState(() => {
    if (open) {
      setScrapeTitle(mediaTitle || '');
      setScrapeYear(mediaYear ? mediaYear.toString() : '');
      setError(null);
      setScrapeResult(null);
    }
  });

  const selectedPlugin = plugins.find(p => p.plugin_key === selectedPluginKey);
  const currentConfigs = pluginsConfig.get(selectedPluginKey) || [];

  const handleExecute = async () => {
    if (!selectedPlugin) return;

    try {
      setExecuting(true);
      setError(null);
      setScrapeResult(null);

      const response = await api.executePlugin(selectedPlugin.plugin_key, {
        plugin_version: selectedPlugin.version,
        source_dir: '', // 暂存区路径由后端处理
        config_name: currentConfigs.find(c => c.id === selectedConfigId)?.config_name,
        media_info: {
          title: scrapeTitle,
          year: scrapeYear,
        },
      });

      // 获取执行结果
      const log = await api.getPluginExecution(response.execution_id);
      setScrapeResult(log);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜刮失败');
    } finally {
      setExecuting(false);
    }
  };

  const handleApply = () => {
    if (scrapeResult?.metadata_output) {
      onApply(scrapeResult.metadata_output);
      onClose();
    }
  };

  const renderMetadataField = (_key: string, value: any, label: string) => {
    if (value === undefined || value === null || value === '') return null;

    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body1">
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </Typography>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>搜刮元数据</DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>选择插件</InputLabel>
            <Select
              value={selectedPluginKey}
              label="选择插件"
              onChange={(e) => {
                setSelectedPluginKey(e.target.value);
                setSelectedConfigId(null);
              }}
            >
              {plugins.filter(p => p.is_enabled && p.is_installed).map((plugin) => (
                <MenuItem key={plugin.plugin_key} value={plugin.plugin_key}>
                  {plugin.name} v{plugin.version}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedPlugin && currentConfigs.length > 0 && (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>选择配置（可选）</InputLabel>
              <Select
                value={selectedConfigId || ''}
                label="选择配置（可选）"
                onChange={(e) => setSelectedConfigId(e.target.value ? Number(e.target.value) : null)}
              >
                <MenuItem value="">使用默认配置</MenuItem>
                {currentConfigs.map((config) => (
                  <MenuItem key={config.id} value={config.id}>
                    {config.config_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            fullWidth
            label="标题"
            value={scrapeTitle}
            onChange={(e) => setScrapeTitle(e.target.value)}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="年份"
            type="number"
            value={scrapeYear}
            onChange={(e) => setScrapeYear(e.target.value)}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {executing && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>正在搜刮...</Typography>
          </Box>
        )}

        {scrapeResult && (
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" gutterBottom>搜刮结果</Typography>

            <Box sx={{ mb: 2 }}>
              <Chip
                label={scrapeResult.status === 'success' ? '成功' : '失败'}
                color={scrapeResult.status === 'success' ? 'success' : 'error'}
              />
            </Box>

            {scrapeResult.status === 'success' && scrapeResult.metadata_output && (
              <Box>
                {renderMetadataField('title', scrapeResult.metadata_output.title, '标题')}
                {renderMetadataField('original_title', scrapeResult.metadata_output.original_title, '原始标题')}
                {renderMetadataField('year', scrapeResult.metadata_output.year, '年份')}
                {renderMetadataField('overview', scrapeResult.metadata_output.overview, '简介')}
                {renderMetadataField('studio', scrapeResult.metadata_output.studio, '制片厂')}
                {renderMetadataField('runtime', scrapeResult.metadata_output.runtime, '时长')}

                {scrapeResult.metadata_output.tags && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      标签
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {scrapeResult.metadata_output.tags.map((tag: string, idx: number) => (
                        <Chip key={idx} label={tag} size="small" />
                      ))}
                    </Box>
                  </Box>
                )}

                {scrapeResult.metadata_output.actors && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      演员
                    </Typography>
                    <Typography variant="body2">
                      {scrapeResult.metadata_output.actors.map((a: any) => a.name).join(', ')}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {scrapeResult.error_message && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {scrapeResult.error_message}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={executing}>取消</Button>
        {scrapeResult?.status === 'success' ? (
          <Button onClick={handleApply} variant="contained">
            应用
          </Button>
        ) : (
          <Button
            onClick={handleExecute}
            variant="contained"
            disabled={!selectedPlugin || !scrapeTitle || executing}
          >
            {executing ? '搜刮中...' : '搜刮'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
