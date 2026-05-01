import type {
  MediaLibrary,
  CreateMediaLibraryDto,
  UpdateMediaLibraryDto,
  Movie,
  TVShow,
  Season,
  Episode,
  PlaybackUrl,
  PlaybackProgress,
  ScanLog,
  MovieDetail,
  MovieListParams,
  PlayRecord,
  PlayRecordDto,
  PlayMediaDto,
  FavoriteResponse,
  HealthCheckResponse,
  DeleteMediaResponse,
  MoviesPage,
  PageTag,
  PageActor,
  RecommendParams,
  TagRecommendation,
  ActorRecommendation,
  LoginResponse,
  RegisterResponse,
  UpdateMetadataDto,
  User,
  UpdateCurrentUserDto,
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  DeleteAccountDto,
  UserPageResponse,
  Plugin,
  PluginGrouped,
  PluginConfig,
  PluginExecutionLog,
  PluginInstallResponse,
  PluginExecutionResponse,
  // 上传模块相关类型
  UploadTask,
  UploadRequest,
  UploadChunkResponse,
  StagingMedia,
  StagingMediaDetail,
  UpdateStagingMetadataDto,
  ScrapeStagingMetadataRequest,
  ScrapeStagingMetadataResponse,
  PublishRequest,
  PublishResponse,
  MergeUploadRequest,
  MergeUploadResponse,
  LogsPageResponse,
  LogsStats,
  DeleteLogsResponse,
  LogsQueryParams,
  LogLevelConfig,
  SetLogLevelResponse,
  LogLevel,
} from '../types';

const API_BASE_URL = '/api';

class ApiClient {
  private baseUrl: string;
  private authRedirectCallback: (() => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAuthRedirect(callback: () => void) {
    this.authRedirectCallback = callback;
  }

  private getAuthToken(): string | null {
    return localStorage.getItem('auth-token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getAuthToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    } as Record<string, string>;

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      headers,
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      const errorMessage = error.message || error.error || `HTTP error! status: ${response.status}`;

      if (response.status === 401 || response.status === 403) {
        if (this.authRedirectCallback) {
          this.authRedirectCallback();
        }
        throw new Error(errorMessage);
      }

      throw new Error(errorMessage);
    }

    // 检查响应体是否为空（如 204 No Content）
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    // 尝试解析 JSON，如果失败则返回 undefined（兼容无返回体的情况）
    return response.json().catch(() => undefined as T);
  }

  // Libraries
  async getLibraries(): Promise<MediaLibrary[]> {
    return this.request<MediaLibrary[]>('/libraries');
  }

  async getLibrary(id: number): Promise<MediaLibrary> {
    return this.request<MediaLibrary>(`/libraries/${id}`);
  }

  async createLibrary(dto: CreateMediaLibraryDto): Promise<MediaLibrary> {
    return this.request<MediaLibrary>('/libraries', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateLibrary(id: number, dto: UpdateMediaLibraryDto): Promise<MediaLibrary> {
    return this.request<MediaLibrary>(`/libraries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  async deleteLibrary(id: number): Promise<void> {
    await this.request(`/libraries/${id}`, {
      method: 'DELETE',
    });
  }

  async triggerScan(id: number, scanType: 'full' | 'incremental' = 'full'): Promise<void> {
    await this.request(`/libraries/${id}/scan?scanType=${scanType}`, {
      method: 'POST',
    });
  }

  async getScanLogs(libraryId: number, limit: number = 10): Promise<ScanLog[]> {
    return this.request<ScanLog[]>(`/libraries/${libraryId}/scan-logs?limit=${limit}`);
  }

  // Auth
  async login(username: string, password: string): Promise<LoginResponse> {
    const url = `${this.baseUrl}/auth/login`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async register(username: string, password: string, email: string): Promise<RegisterResponse> {
    const url = `${this.baseUrl}/auth/register`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password, email }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Registration failed' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // User Management
  async getCurrentUser(): Promise<User> {
    return this.request<User>('/user/me');
  }

  async updateCurrentUser(dto: UpdateCurrentUserDto): Promise<User> {
    return this.request<User>('/user/me', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  async getUsers(username?: string, page: number = 1, pageSize: number = 10): Promise<UserPageResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('pageSize', pageSize.toString());
    if (username) params.append('username', username);
    return this.request<UserPageResponse>(`/user?${params.toString()}`);
  }

  async getUser(id: number): Promise<User> {
    return this.request<User>(`/user/${id}`);
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    return this.request<User>('/user', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateUser(id: number, dto: UpdateUserDto): Promise<User> {
    return this.request<User>(`/user/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  async deleteUser(id: number): Promise<void> {
    await this.request(`/user/${id}`, {
        method: 'DELETE',
    });
  }

  async changeUserPassword(id: number, dto: ChangePasswordDto): Promise<void> {
    await this.request(`/user/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  async deleteCurrentAccount(dto: DeleteAccountDto): Promise<void> {
    await this.request('/user/me', {
      method: 'DELETE',
      body: JSON.stringify(dto),
    });
  }

  // Movies
  async getMovies(libraryId?: number): Promise<Movie[]> {
    const params = libraryId ? `?libraryId=${libraryId}` : '';
    return this.request<Movie[]>(`/movies${params}`);
  }

  async getMovie(id: number): Promise<Movie> {
    return this.request<Movie>(`/movies/${id}`);
  }

  // TV Shows
  async getTVShows(libraryId?: number): Promise<TVShow[]> {
    const params = libraryId ? `?libraryId=${libraryId}` : '';
    return this.request<TVShow[]>(`/tvshows${params}`);
  }

  async getTVShow(id: number): Promise<TVShow> {
    return this.request<TVShow>(`/tvshows/${id}`);
  }

  async getSeasons(tvShowId: number): Promise<Season[]> {
    return this.request<Season[]>(`/tvshows/${tvShowId}/seasons`);
  }

  async getEpisodes(tvShowId: number, seasonId: number): Promise<Episode[]> {
    return this.request<Episode[]>(`/tvshows/${tvShowId}/seasons/${seasonId}/episodes`);
  }

  // Playback
  async getPlaybackUrl(mediaId: number, mediaType: 'movie' | 'episode'): Promise<PlaybackUrl> {
    return this.request<PlaybackUrl>(`/playback/url?mediaId=${mediaId}&mediaType=${mediaType}`);
  }

  async getPlaybackProgress(userId: string, movieId?: number, episodeId?: number): Promise<PlaybackProgress> {
    const params = new URLSearchParams({ userId });
    if (movieId) params.append('movieId', movieId.toString());
    if (episodeId) params.append('episodeId', episodeId.toString());
    return this.request<PlaybackProgress>(`/playback/progress?${params.toString()}`);
  }

  async updatePlaybackProgress(
    userId: string,
    movieId: number | undefined,
    episodeId: number | undefined,
    position: number,
    duration?: number
  ): Promise<void> {
    const params = new URLSearchParams({ userId });
    await this.request(`/playback/progress?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify({ movieId, episodeId, position, duration }),
    });
  }

  // ===== 新增 API 方法 =====

  /**
   * 标签相关 API
   */
  async getTags(page: number = 1, pageSize: number = 20): Promise<PageTag> {
    return this.request<PageTag>(`/tags?page=${page}&pageSize=${pageSize}&sortBy=mediaCount`);
  }

  /**
   * 演员相关 API
   */
  async getActors(page: number = 1, pageSize: number = 20): Promise<PageActor> {
    return this.request<PageActor>(`/actors?page=${page}&pageSize=${pageSize}&sortBy=mediaCount`);
  }

  /**
   * 电影相关扩展 API
   */
  /**
   * 获取电影列表（带高级筛选）
   */
  async getMoviesWithParams(params: MovieListParams): Promise<MoviesPage> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.libraryId) queryParams.append('libraryId', params.libraryId.toString());
    if (params.tags) queryParams.append('tags', params.tags);
    if (params.actorId) queryParams.append('actorId', params.actorId.toString());
    if (params.userId) queryParams.append('userId', params.userId.toString());
    if (params.favor !== undefined) queryParams.append('favor', params.favor.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const queryString = queryParams.toString();
    return this.request<MoviesPage>(`/movies${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * 获取电影详情（完整信息）
   */
  async getMovieDetail(id: string | number): Promise<MovieDetail> {
    return this.request<MovieDetail>(`/movies/${id}`);
  }

  /**
   * 删除电影
   */
  async deleteMovie(id: string | number): Promise<DeleteMediaResponse> {
    return this.request<DeleteMediaResponse>(`/movies/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 媒体相关 API
   */

  /**
   * 发起播放请求（POST）
   */
  async requestPlay(mediaId: string | number, dto: PlayMediaDto): Promise<Blob> {
    const url = `${this.baseUrl}/media/${mediaId}/play`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'An error occurred' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.blob();
  }

  /**
   * 获取媒体文件（通过路径）
   */
  get mediaFileUrl(): (path: string) => string {
    return (path: string) => {
      const encodedPath = encodeURIComponent(path);
      return `/api/media/file?path=${encodedPath}`;
    };
  }

  /**
   * 获取图片（通过 url_name）
   */
  get imageUrl(): (url_name: string) => string {
    return (url_name: string) => {
      return `/api/media/image/${url_name}`;
    };
  }

  /**
   * 切换收藏状态（已废弃，仅供参考）
   * @deprecated
   */
  async toggleFavorite(mediaId: string | number, userId: number): Promise<FavoriteResponse> {
    return this.request<FavoriteResponse>(`/media/${mediaId}/favor`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  /**
   * 播放记录相关 API
   */
  /**
   * 获取播放记录
   */
  async getPlayRecord(mediaId: string | number, userId: number): Promise<PlayRecord> {
    return this.request<PlayRecord>(`/playrecord/${mediaId}?userId=${userId}`);
  }

  /**
   * 创建或更新播放记录
   */
  async upsertPlayRecord(mediaId: string | number, dto: PlayRecordDto): Promise<PlayRecord> {
    return this.request<PlayRecord>(`/playrecord/${mediaId}`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const url = this.baseUrl.replace('/api', '') + '/health';
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 推荐相关 API
   */
  /**
   * 基于标签推荐电影
   */
  async recommendByTags(params: RecommendParams): Promise<TagRecommendation[]> {
    const queryParams = new URLSearchParams();
    if (params.tagNum) queryParams.append('tagNum', params.tagNum.toString());
    if (params.mediaNum) queryParams.append('mediaNum', params.mediaNum.toString());
    if (params.mediaSearchType) queryParams.append('mediaSearchType', params.mediaSearchType);
    return this.request<TagRecommendation[]>(`/movies/recommend/by-tags?${queryParams.toString()}`);
  }

  /**
   * 基于演员推荐电影
   */
  async recommendByActors(params: RecommendParams): Promise<ActorRecommendation[]> {
    const queryParams = new URLSearchParams();
    if (params.tagNum) queryParams.append('tagNum', params.tagNum.toString());
    if (params.mediaNum) queryParams.append('mediaNum', params.mediaNum.toString());
    if (params.mediaSearchType) queryParams.append('mediaSearchType', params.mediaSearchType);
    return this.request<ActorRecommendation[]>(`/movies/recommend/by-actors?${queryParams.toString()}`);
  }

  /**
   * 更新媒体元数据
   */
  async updateMediaMetadata(mediaId: string | number, dto: UpdateMetadataDto): Promise<void> {
    await this.request(`/media/${mediaId}/metadata`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 搜刮媒体源数据
   */
  async scrapeMedia(mediaId: string | number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/media/${mediaId}/scan`, {
      method: 'POST',
    });
  }

  /**
   * 上传元数据zip文件
   */
  async uploadMetadataZip(mediaId: string | number, file: File): Promise<{ message: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const token = this.getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/media/${mediaId}/update-metadata`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 插件相关 API
   */
  /**
   * 获取所有插件
   */
  async getPlugins(): Promise<Plugin[]> {
    return this.request<Plugin[]>('/plugins');
  }

  /**
   * 获取按组分组的插件列表
   */
  async getPluginsGrouped(): Promise<PluginGrouped[]> {
    return this.request<PluginGrouped[]>('/plugins/grouped');
  }

  /**
   * 获取单个插件详情
   */
  async getPlugin(pluginKey: string): Promise<Plugin> {
    return this.request<Plugin>(`/plugins/${pluginKey}`);
  }

  /**
   * 安装插件
   */
  async installPlugin(file: File): Promise<PluginInstallResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const token = this.getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/plugins/install`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Install failed' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 更新插件状态
   */
  async updatePlugin(pluginKey: string, pluginVersion: string, dto: { is_enabled: boolean }): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/plugins/${pluginKey}?version=${pluginVersion}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(pluginKey: string, version: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/plugins/${pluginKey}?version=${version}`, {
      method: 'DELETE',
    });
  }

  /**
   * 获取插件配置
   */
  async getPluginConfigs(pluginKey: string, libraryId?: number): Promise<PluginConfig[]> {
    const params = libraryId ? `?libraryId=${libraryId}` : '';
    return this.request<PluginConfig[]>(`/plugins/${pluginKey}/configs${params}`);
  }

  /**
   * 创建插件配置
   */
  async createPluginConfig(pluginKey: string, dto: {
    plugin_version?: string;
    library_id?: number;
    config_name: string;
    config_data: Record<string, any>;
    is_active: boolean;
  }): Promise<{ id: number }> {
    return this.request<{ id: number }>(`/plugins/${pluginKey}/configs`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 更新插件配置
   */
  async updatePluginConfig(pluginKey: string, configId: number, dto: {
    library_id?: number;
    config_name: string;
    config_data: Record<string, any>;
    is_active: boolean;
  }): Promise<{ id: number }> {
    return this.request<{ id: number }>(`/plugins/${pluginKey}/configs/${configId}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 删除插件配置
   */
  async deletePluginConfig(pluginKey: string, configId: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/plugins/${pluginKey}/configs/${configId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 执行插件搜刮
   */
  async executePlugin(pluginKey: string, dto: {
    plugin_version?: string;
    source_dir: string;
    output_dir?: string;
    config_name?: string;
    media_info?: { title?: string; year?: string };
  }): Promise<PluginExecutionResponse> {
    return this.request<PluginExecutionResponse>(`/plugins/${pluginKey}/execute`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 批量执行插件
   */
  async executePluginBatch(pluginKey: string, dto: {
    plugin_version?: string;
    library_id: number;
    media_ids: number[];
    config_name?: string;
  }): Promise<{ total: number; execution_ids: number[] }> {
    return this.request<{ total: number; execution_ids: number[] }>(`/plugins/${pluginKey}/execute-batch`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 获取执行状态
   */
  async getPluginExecution(executionId: number): Promise<PluginExecutionLog> {
    return this.request<PluginExecutionLog>(`/plugins/execution/${executionId}`);
  }

  /**
   * 获取执行日志列表
   */
  async getPluginExecutionLogs(pluginKey: string, mediaId?: number, limit: number = 10): Promise<PluginExecutionLog[]> {
    const params = new URLSearchParams();
    if (mediaId) params.append('mediaId', mediaId.toString());
    params.append('limit', limit.toString());
    return this.request<PluginExecutionLog[]>(`/plugins/${pluginKey}/logs?${params.toString()}`);
  }

  /**
   * 取消执行
   */
  async cancelPluginExecution(executionId: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/plugins/execution/${executionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 重试执行
   */
  async retryPluginExecution(executionId: number): Promise<{ executionId: number; status: string }> {
    return this.request<{ executionId: number; status: string }>(`/plugins/execution/${executionId}/retry`, {
      method: 'POST',
    });
  }

  /**
   * ===== 上传模块 API =====
   */

  /**
   * 创建上传任务
   * 根据设计文档，如果 MD5 匹配已存在的任务，会返回已有任务信息
   */
  async createUploadTask(dto: UploadRequest): Promise<UploadTask> {
    return this.request<UploadTask>('/media/upload-tasks', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 上传分片
   */
  async uploadChunk(uploadId: string, chunkIndex: number, chunk: Blob): Promise<UploadChunkResponse> {
    const token = this.getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    headers['Content-Type'] = 'application/octet-stream';

    const url = `${this.baseUrl}/media/upload-tasks/${uploadId}/chunk?chunk_index=${chunkIndex}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: chunk,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 获取上传任务信息
   */
  async getUploadTask(uploadId: string): Promise<UploadTask> {
    return this.request<UploadTask>(`/media/upload-tasks/${uploadId}`);
  }

  /**
   * 删除上传任务
   */
  async deleteUploadTask(uploadId: string): Promise<void> {
    await this.request(`/media/upload-tasks/${uploadId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 合并分片，创建待发布媒体
   */
  async mergeUpload(dto: MergeUploadRequest): Promise<MergeUploadResponse> {
    const { upload_id, ...requestData } = dto;
    return this.request<MergeUploadResponse>(`/media/upload-tasks/${upload_id}/merge`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  /**
   * 获取待发布媒体列表
   */
  async getStagingMedias(): Promise<StagingMedia[]> {
    return this.request<StagingMedia[]>('/staging/list');
  }

  /**
   * 获取待发布媒体详情
   */
  async getStagingMedia(id: string): Promise<StagingMediaDetail> {
    return this.request<StagingMediaDetail>(`/staging/${id}`);
  }

  /**
   * 更新待发布媒体元数据
   */
  async updateStagingMetadata(id: string, dto: UpdateStagingMetadataDto): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/staging/${id}/metadata`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 搜刮待发布媒体元数据
   */
  async scrapeStagingMetadata(stagingMediaId: string, dto: ScrapeStagingMetadataRequest): Promise<ScrapeStagingMetadataResponse> {
    return this.request<ScrapeStagingMetadataResponse>(`/staging/${stagingMediaId}/scrape-metadata`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 上传海报
   */
  async uploadStagingPoster(id: string, file: File): Promise<{ message: string }> {
    const formData = new FormData();
    formData.append('poster', file);

    const token = this.getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/staging/${id}/poster`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 上传背景图
   */
  async uploadStagingFanart(id: string, file: File): Promise<{ message: string }> {
    const formData = new FormData();
    formData.append('fanart', file);

    const token = this.getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/staging/${id}/fanart`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 上传截图
   */
  async uploadStagingScreenshot(id: string, file: File): Promise<{ message: string }> {
    const formData = new FormData();
    formData.append('screenshot', file);

    const token = this.getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/staging/${id}/screenshot`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 删除待发布媒体
   */
  async deleteStagingMedia(id: string): Promise<void> {
    await this.request(`/staging/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 发布到库
   */
  async publishStagingMedia(id: string, dto: PublishRequest): Promise<PublishResponse> {
    return this.request<PublishResponse>(`/staging/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 获取媒体库列表（用于发布时选择）
   */
  async getLibrariesForPublish(): Promise<MediaLibrary[]> {
    return this.request<MediaLibrary[]>('/libraries');
  }

  /**
   * ===== 日志管理 API =====
   */

  /**
   * 获取日志列表
   */
  async getLogs(params: LogsQueryParams): Promise<LogsPageResponse> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.level) queryParams.append('level', params.level);
    if (params.startTime) queryParams.append('startTime', params.startTime);
    if (params.endTime) queryParams.append('endTime', params.endTime);
    if (params.category) queryParams.append('category', params.category);
    if (params.message) queryParams.append('message', params.message);
    if (params.machineName) queryParams.append('machineName', params.machineName);
    if (params.hasException !== undefined) queryParams.append('hasException', params.hasException.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    if (params.fromId !== undefined) queryParams.append('fromId', params.fromId.toString());
    if (params.toId !== undefined) queryParams.append('toId', params.toId.toString());

    const queryString = queryParams.toString();
    return this.request<LogsPageResponse>(`/logs${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * 获取日志统计
   */
  async getLogsStats(): Promise<LogsStats> {
    return this.request<LogsStats>('/logs/stats');
  }

  /**
   * 获取日志级别配置
   */
  async getLogLevelConfig(): Promise<LogLevelConfig> {
    return this.request<LogLevelConfig>('/logs/levels');
  }

  /**
   * 设置日志级别
   */
  async setLogLevel(level: LogLevel | string): Promise<SetLogLevelResponse> {
    return this.request<SetLogLevelResponse>('/logs/level', {
      method: 'PUT',
      body: JSON.stringify({ level }),
    });
  }

  /**
   * 删除旧日志
   */
  async deleteOldLogs(beforeDate: string): Promise<DeleteLogsResponse> {
    return this.request<DeleteLogsResponse>(`/logs?beforeDate=${beforeDate}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
