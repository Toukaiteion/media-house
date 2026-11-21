/**
 * 电影列表页缓存服务
 * 用于管理导航来源标记和 UI 状态缓存
 */

const NAVIGATION_SOURCE_KEY = 'movies-navigation-source';
const UI_STATE_KEY = 'movies-ui-state';
const LIST_URL_KEY = 'movies-list-url';

export interface UIState {
  scrollY: number;
  filterBarVisible: boolean;
}

export class MovieListCache {
  /**
   * 标记导航来源
   * @param source 'play' | 'detail' | null
   */
  setNavigationSource(source: 'play' | 'detail' | null) {
    try {
      if (source) {
        sessionStorage.setItem(NAVIGATION_SOURCE_KEY, source);
      } else {
        sessionStorage.removeItem(NAVIGATION_SOURCE_KEY);
      }
    } catch (err) {
      console.error('设置导航来源失败:', err);
    }
  }

  /**
   * 获取导航来源
   * @returns 'play' | 'detail' | null
   */
  getNavigationSource(): 'play' | 'detail' | null {
    try {
      const source = sessionStorage.getItem(NAVIGATION_SOURCE_KEY);
      return source === 'play' || source === 'detail' ? source : null;
    } catch (err) {
      console.error('获取导航来源失败:', err);
      return null;
    }
  }

  /**
   * 保存 UI 状态（滚动位置、筛选栏可见性等）
   */
  saveUIState(state: UIState) {
    try {
      sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('保存 UI 状态失败:', err);
    }
  }

  /**
   * 加载 UI 状态
   */
  loadUIState(): UIState | null {
    try {
      const saved = sessionStorage.getItem(UI_STATE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.error('加载 UI 状态失败:', err);
      return null;
    }
  }

  /**
   * 保存列表页当前的完整 URL（含分页和筛选），
   * 用于从详情页「删除后返回」时还原到原来的列表位置。
   */
  saveListUrl(url: string) {
    try {
      sessionStorage.setItem(LIST_URL_KEY, url);
    } catch (err) {
      console.error('保存列表 URL 失败:', err);
    }
  }

  /**
   * 读取上次列表页的完整 URL
   */
  loadListUrl(): string | null {
    try {
      return sessionStorage.getItem(LIST_URL_KEY);
    } catch (err) {
      console.error('读取列表 URL 失败:', err);
      return null;
    }
  }

  /**
   * 清除所有缓存
   */
  clear() {
    try {
      sessionStorage.removeItem(NAVIGATION_SOURCE_KEY);
      sessionStorage.removeItem(UI_STATE_KEY);
      sessionStorage.removeItem(LIST_URL_KEY);
    } catch (err) {
      console.error('清除缓存失败:', err);
    }
  }
}

export const movieListCache = new MovieListCache();
