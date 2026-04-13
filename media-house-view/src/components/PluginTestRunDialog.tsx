import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  CircularProgress,
  Alert,
  Box,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import type { Plugin, PluginConfig } from '../types';

interface PluginTestRunDialogProps {
  open: boolean;
  plugin: Plugin | null;
  configs: PluginConfig[];
  onClose: () => void;
  onExecute: (sourceDir: string, outputDir: string, configName?: string) => void;
  executing: boolean;
}

const EMPTY_CONFIG_NAME: string = 'None';

export function PluginTestRunDialog({
  open,
  plugin,
  configs,
  onClose,
  onExecute,
  executing,
}: PluginTestRunDialogProps) {
  const [sourceDir, setSourceDir] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [configName, setConfigName] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = () => {
    if (!sourceDir.trim()) {
      setError('源目录不能为空');
      return;
    }
    if (!outputDir.trim()) {
      setError('输出目录不能为空');
      return;
    }

    setError(null);
    if (configName === '' || configName === EMPTY_CONFIG_NAME) {
      setConfigName(undefined);
    }
    onExecute(sourceDir, outputDir, configName);
  };

  const handleClose = () => {
    setSourceDir('');
    setOutputDir('');
    setConfigName(EMPTY_CONFIG_NAME);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>测试运行插件</DialogTitle>
      <DialogContent>
        {plugin && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              插件: {plugin.name} v{plugin.version}
            </Typography>
          </Box>
        )}

        <FormControl fullWidth sx={{ mb: 2 }}>
          <TextField
            fullWidth
            label="源目录"
            value={sourceDir}
            onChange={(e) => setSourceDir(e.target.value)}
            placeholder="/path/to/media/movie1"
            disabled={executing}
          />
        </FormControl>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <TextField
            fullWidth
            label="输出目录"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="/path/to/output/movie1_processed"
            disabled={executing}
          />
        </FormControl>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>配置名称（可选）</InputLabel>
          <Select
            value={configName}
            label="配置名称（可选）"
            onChange={(e) => setConfigName(e.target.value as string)}
            disabled={executing}
          >
            <MenuItem value="">
              不使用配置
            </MenuItem>
            {configs
              .filter((config) => config.plugin_key === plugin?.plugin_key)
              .map((config) => (
                <MenuItem key={config.id} value={config.config_name}>
                  {config.config_name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={executing}>
          取消
        </Button>
        <Button onClick={handleExecute} variant="contained" disabled={executing}>
          {executing ? <CircularProgress size={20} /> : '执行'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
