import { useState, useEffect } from 'react';
import type { Plugin, PluginConfig } from '../../../../types';
import { api } from '../../../../services/api';

export function usePlugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [pluginsConfig, setPluginsConfig] = useState<Map<string, PluginConfig[]>>(new Map());

  const loadPlugins = async () => {
    try {
      const data = await api.getPlugins();
      setPlugins(data);

      // 加载每个插件的配置
      const configMap = new Map<string, PluginConfig[]>();
      for (const plugin of data) {
        try {
          const configs = await api.getPluginConfigs(plugin.plugin_key);
          configMap.set(plugin.plugin_key, configs);
        } catch (err) {
          console.error(`加载插件配置失败: ${plugin.plugin_key}`, err);
        }
      }
      setPluginsConfig(configMap);
    } catch (err) {
      console.error('加载插件失败:', err);
    }
  };

  useEffect(() => {
    loadPlugins();
  }, []);

  return { plugins, pluginsConfig, loadPlugins };
}
