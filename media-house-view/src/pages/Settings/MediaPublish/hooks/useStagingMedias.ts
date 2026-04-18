import { useState, useCallback, useEffect } from 'react';
import type { StagingMedia } from '../../../../types';
import { api } from '../../../../services/api';

export function useStagingMedias() {
  const [stagingMedias, setStagingMedias] = useState<StagingMedia[]>([]);
  const [loadingMedias, setLoadingMedias] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const refreshStagingMedias = useCallback(async () => {
    try {
      setLoadingMedias(true);
      setMediaError(null);
      const data = await api.getStagingMedias();
      setStagingMedias(data);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : '加载待发布媒体失败');
    } finally {
      setLoadingMedias(false);
    }
  }, []);
  
  useEffect(() => {
    refreshStagingMedias();
  }, []);

  return { stagingMedias, loadingMedias, mediaError, refreshStagingMedias };
}
