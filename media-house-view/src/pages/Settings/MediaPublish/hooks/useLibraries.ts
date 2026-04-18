import { useState, useEffect } from 'react';
import type { MediaLibrary } from '../../../../types';
import { api } from '../../../../services/api';

export function useLibraries() {
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);

  const loadLibraries = async () => {
    try {
      const data = await api.getLibraries();
      setLibraries(data);
    } catch (err) {
      console.error('加载媒体库失败:', err);
    }
  };

  useEffect(() => {
    loadLibraries();
  }, []);

  return { libraries, loadLibraries };
}
