import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import type { Plugin, PluginConfigSchemaField } from '../types';
import { useEffect, useState } from 'react';

interface PluginConfigDialogProps {
  open: boolean;
  plugin: Plugin | null;
  onClose: () => void;
  onSave: (configName: string, configData: Record<string, any>) => void;
}

export function PluginConfigDialog({ open, plugin, onClose, onSave }: PluginConfigDialogProps) {
  const [configName, setConfigName] = useState('default');
  const [configData, setConfigData] = useState<Record<string, any>>({});

  // 重置表单
  useEffect(() => {
    if (open && plugin) {
      setConfigName('default');
      const defaultData: Record<string, any> = {};
      if (plugin.config_schema) {
        Object.entries(plugin.config_schema).forEach(([key, field]) => {
          if (field.default !== undefined) {
            defaultData[key] = field.default;
          }
        });
      }
      setConfigData(defaultData);
    }
  }, [open, plugin]);

  // 处理配置数据变化
  const handleConfigChange = (key: string, value: any) => {
    setConfigData({ ...configData, [key]: value });
  };

  // 渲染配置字段
  const renderField = (key: string, field: PluginConfigSchemaField) => {
    switch (field.type) {
      case 'select':
        return (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={configData[key] || field.default}
              label={field.label}
              onChange={(e) => handleConfigChange(key, e.target.value)}
            >
              {field.options?.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'boolean':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={configData[key] ?? field.default}
                onChange={(e) => handleConfigChange(key, e.target.checked)}
              />
            }
            label={field.label}
            sx={{ mb: 2 }}
          />
        );

      case 'number':
        return (
          <TextField
            type="number"
            label={field.label}
            fullWidth
            value={configData[key] ?? field.default}
            onChange={(e) => handleConfigChange(key, Number(e.target.value))}
            inputProps={{
              min: field.min,
              max: field.max,
            }}
            sx={{ mb: 2 }}
          />
        );

      case 'string':
      default:
        return (
          <TextField
            label={field.label}
            fullWidth
            value={configData[key] || field.default || ''}
            onChange={(e) => handleConfigChange(key, e.target.value)}
            sx={{ mb: 2 }}
          />
        );
    }
  };

  // 处理保存
  const handleSave = () => {
    if (plugin) {
      onSave(configName, configData);
      onClose();
    }
  };

  if (!plugin) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        配置插件 - {plugin.name}
      </DialogTitle>
      <DialogContent>
        {/* 配置名称 */}
        <TextField
          autoFocus
          margin="dense"
          label="配置名称"
          fullWidth
          value={configName}
          onChange={(e) => setConfigName(e.target.value)}
          helperText="用于标识不同配置"
          sx={{ mb: 2 }}
        />

        {/* 动态渲染配置字段 */}
        {plugin.config_schema && (
          <Box>
            {Object.entries(plugin.config_schema).map(([key, field]) => (
              <Box key={key}>
                {renderField(key, field)}
              </Box>
            ))}
          </Box>
        )}

        {/* 支持的信息 */}
        <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            插件信息
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
            {plugin.supported_media_types.map((type) => (
              <Chip key={type} label={type} size="small" />
            ))}
          </Box>
          {plugin.supported_languages && (
            <Typography variant="body2" color="text.secondary">
              支持语言: {plugin.supported_languages.join(', ')}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button onClick={handleSave} variant="contained">
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
