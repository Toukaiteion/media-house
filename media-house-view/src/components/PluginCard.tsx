import { Card, CardContent, CardActions, Typography, Switch, IconButton, Chip, Box } from '@mui/material';
import { Settings as SettingsIcon, Delete as DeleteIcon, PlayArrow as PlayIcon } from '@mui/icons-material';
import type { Plugin } from '../types';

interface PluginCardProps {
  plugin: Plugin;
  onToggleEnable: (plugin: Plugin, enabled: boolean) => void;
  onConfig: (plugin: Plugin) => void;
  onTestRun: (plugin: Plugin) => void;
  onUninstall: (plugin: Plugin) => void;
}

export function PluginCard({ plugin, onToggleEnable, onConfig, onTestRun, onUninstall }: PluginCardProps) {
  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {plugin.name}
          </Typography>
          <Switch
            checked={plugin.is_enabled}
            onChange={(e) => onToggleEnable(plugin, e.target.checked)}
            size="small"
          />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, minHeight: 40 }}>
          {plugin.description || '无描述'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <Chip
            label={`v${plugin.version}`}
            size="small"
            variant="outlined"
            color="primary"
          />
          {plugin.author && (
            <Chip
              label={plugin.author}
              size="small"
              variant="outlined"
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
          {plugin.supported_media_types.map((type) => (
            <Chip
              key={type}
              label={type}
              size="small"
              color="secondary"
            />
          ))}
        </Box>
        {plugin.homepage && (
          <Typography
            variant="caption"
            color="primary"
            sx={{ mt: 1, display: 'block', textDecoration: 'none' }}
            component="a"
            href={plugin.homepage}
            target="_blank"
          >
            {plugin.homepage}
          </Typography>
        )}
      </CardContent>
      <CardActions sx={{ justifyContent: 'flex-end', gap: 0.5 }}>
        <IconButton
          onClick={() => onTestRun(plugin)}
          aria-label="测试运行"
          title="测试运行"
        >
          <PlayIcon />
        </IconButton>
        <IconButton
          onClick={() => onConfig(plugin)}
          aria-label="配置"
          title="配置"
        >
          <SettingsIcon />
        </IconButton>
        <IconButton
          onClick={() => onUninstall(plugin)}
          aria-label="卸载"
          title="卸载"
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </CardActions>
    </Card>
  );
}
