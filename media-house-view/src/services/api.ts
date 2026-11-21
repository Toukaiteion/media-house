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
  // 涓婁紶妯″潡鐩稿叧绫诲瀷
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
  // 鏂囦欢澶逛笂浼犵浉鍏崇被鍨?
  FolderUploadTask,
  CreateFolderUploadRequest,
  AddFileToFolderRequest,
  CreateStagingResponse,
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

    // 妫€鏌ュ搷搴斾綋鏄惁涓虹┖锛堝 204 No Content锛?
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    // 灏濊瘯瑙ｆ瀽 JSON锛屽鏋滃け璐ュ垯杩斿洖 undefined锛堝吋瀹规棤杩斿洖浣撶殑鎯呭喌锛?
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

  // ===== 鏂板 API 鏂规硶 =====

  /**
   * 鏍囩鐩稿叧 API
   */
  async getTags(page: number = 1, pageSize: number = 20, favorited: boolean = false): Promise<PageTag> {
    const favoritedParam = favorited ? '&favorited=true' : '';
    return this.request<PageTag>(`/tags?page=${page}&pageSize=${pageSize}&sortBy=mediaCount${favoritedParam}`);
  }

  /**
   * 鍒囨崲鏍囩鏀惰棌
   */
  async toggleTagFavorite(tagId: string | number): Promise<{ is_favorited: boolean }> {
    return this.request<{ is_favorited: boolean }>(`/tags/${tagId}/favor`, { method: 'POST' });
  }

  /**
   * 婕斿憳鐩稿叧 API
   */
  async getActors(page: number = 1, pageSize: number = 20, favorited: boolean = false): Promise<PageActor> {
    const favoritedParam = favorited ? '&favorited=true' : '';
    return this.request<PageActor>(`/actors?page=${page}&pageSize=${pageSize}&sortBy=mediaCount${favoritedParam}`);
  }

  /**
   * 鍒囨崲婕斿憳鏀惰棌
   */
  async toggleActorFavorite(actorId: string | number): Promise<{ is_favorited: boolean }> {
    return this.request<{ is_favorited: boolean }>(`/actors/${actorId}/favor`, { method: 'POST' });
  }

  /**
   * 鐢靛奖鐩稿叧鎵╁睍 API
   */
  /**
   * 鑾峰彇鐢靛奖鍒楄〃锛堝甫楂樼骇绛涢€夛級
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
   * 鑾峰彇鐢靛奖璇︽儏锛堝畬鏁翠俊鎭級
   */
  async getMovieDetail(id: string | number): Promise<MovieDetail> {
    return this.request<MovieDetail>(`/movies/${id}`);
  }

  /**
   * 鍒犻櫎鐢靛奖
   */
  async deleteMovie(id: string | number): Promise<DeleteMediaResponse> {
    return this.request<DeleteMediaResponse>(`/movies/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 濯掍綋鐩稿叧 API
   */

  /**
   * 鍙戣捣鎾斁璇锋眰锛圥OST锛?
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
   * 鑾峰彇濯掍綋鏂囦欢锛堥€氳繃璺緞锛?
   */
  get mediaFileUrl(): (path: string) => string {
    return (path: string) => {
      const encodedPath = encodeURIComponent(path);
      return `/api/media/file?path=${encodedPath}`;
    };
  }

  /**
   * 鑾峰彇鍥剧墖锛堥€氳繃 url_name锛?
   */
  get imageUrl(): (url_name: string) => string {
    return (url_name: string) => {
      return `/api/media/image/${url_name}`;
    };
  }

  /**
   * 鍒囨崲鏀惰棌鐘舵€侊紙宸插簾寮冿紝浠呬緵鍙傝€冿級
   * @deprecated
   */
  async toggleFavorite(mediaId: string | number, userId: number): Promise<FavoriteResponse> {
    return this.request<FavoriteResponse>(`/media/${mediaId}/favor`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  /**
   * 鎾斁璁板綍鐩稿叧 API
   */
  /**
   * 鑾峰彇鎾斁璁板綍
   */
  async getPlayRecord(mediaId: string | number, userId: number): Promise<PlayRecord> {
    return this.request<PlayRecord>(`/playrecord/${mediaId}?userId=${userId}`);
  }

  /**
   * 鍒涘缓鎴栨洿鏂版挱鏀捐褰?
   */
  async upsertPlayRecord(mediaId: string | number, dto: PlayRecordDto): Promise<PlayRecord> {
    return this.request<PlayRecord>(`/playrecord/${mediaId}`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鏍囪鎾斁瀹屾垚锛堢墖灏炬椂璋冪敤锛岃銆屽凡鐪嬪畬銆嶇姸鎬佽兘琚悗绔褰曪級
   */
  async markPlaybackCompleted(dto: {
    media_library_id: number;
    media_id: number;
    position_seconds: number;
  }): Promise<{ message: string }> {
    return this.request<{ message: string }>('/playrecord/progress/complete', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鍋ュ悍妫€鏌?
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
   * 鎺ㄨ崘鐩稿叧 API
   */
  /**
   * 鍩轰簬鏍囩鎺ㄨ崘鐢靛奖
   */
  async recommendByTags(params: RecommendParams): Promise<TagRecommendation[]> {
    const queryParams = new URLSearchParams();
    if (params.tagNum) queryParams.append('tagNum', params.tagNum.toString());
    if (params.mediaNum) queryParams.append('mediaNum', params.mediaNum.toString());
    if (params.mediaSearchType) queryParams.append('mediaSearchType', params.mediaSearchType);
    return this.request<TagRecommendation[]>(`/movies/recommend/by-tags?${queryParams.toString()}`);
  }

  /**
   * 鍩轰簬婕斿憳鎺ㄨ崘鐢靛奖
   */
  async recommendByActors(params: RecommendParams): Promise<ActorRecommendation[]> {
    const queryParams = new URLSearchParams();
    if (params.tagNum) queryParams.append('tagNum', params.tagNum.toString());
    if (params.mediaNum) queryParams.append('mediaNum', params.mediaNum.toString());
    if (params.mediaSearchType) queryParams.append('mediaSearchType', params.mediaSearchType);
    return this.request<ActorRecommendation[]>(`/movies/recommend/by-actors?${queryParams.toString()}`);
  }

  /**
   * 鏇存柊濯掍綋鍏冩暟鎹?
   */
  async updateMediaMetadata(mediaId: string | number, dto: UpdateMetadataDto): Promise<void> {
    await this.request(`/media/${mediaId}/metadata`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鎼滃埉濯掍綋婧愭暟鎹?
   */
  async scrapeMedia(mediaId: string | number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/media/${mediaId}/scan`, {
      method: 'POST',
    });
  }

  /**
   * 涓婁紶鍏冩暟鎹畓ip鏂囦欢
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
   * 鎻掍欢鐩稿叧 API
   */
  /**
   * 鑾峰彇鎵€鏈夋彃浠?
   */
  async getPlugins(): Promise<Plugin[]> {
    return this.request<Plugin[]>('/plugins');
  }

  /**
   * 鑾峰彇鎸夌粍鍒嗙粍鐨勬彃浠跺垪琛?
   */
  async getPluginsGrouped(): Promise<PluginGrouped[]> {
    return this.request<PluginGrouped[]>('/plugins/grouped');
  }

  /**
   * 鑾峰彇鍗曚釜鎻掍欢璇︽儏
   */
  async getPlugin(pluginKey: string): Promise<Plugin> {
    return this.request<Plugin>(`/plugins/${pluginKey}`);
  }

  /**
   * 瀹夎鎻掍欢
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
   * 鏇存柊鎻掍欢鐘舵€?
   */
  async updatePlugin(pluginKey: string, pluginVersion: string, dto: { is_enabled: boolean }): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/plugins/${pluginKey}?version=${pluginVersion}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鍗歌浇鎻掍欢
   */
  async uninstallPlugin(pluginKey: string, version: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/plugins/${pluginKey}?version=${version}`, {
      method: 'DELETE',
    });
  }

  /**
   * 鑾峰彇鎻掍欢閰嶇疆
   */
  async getPluginConfigs(pluginKey: string, libraryId?: number): Promise<PluginConfig[]> {
    const params = libraryId ? `?libraryId=${libraryId}` : '';
    return this.request<PluginConfig[]>(`/plugins/${pluginKey}/configs${params}`);
  }

  /**
   * 鍒涘缓鎻掍欢閰嶇疆
   */
  async createPluginConfig(pluginKey: string, dto: {
    plugin_version?: string;
    library_id?: number;
    config_name: string;
    config_data: Record<string, unknown>;
    is_active: boolean;
  }): Promise<{ id: number }> {
    return this.request<{ id: number }>(`/plugins/${pluginKey}/configs`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鏇存柊鎻掍欢閰嶇疆
   */
  async updatePluginConfig(pluginKey: string, configId: number, dto: {
    library_id?: number;
    config_name: string;
    config_data: Record<string, unknown>;
    is_active: boolean;
  }): Promise<{ id: number }> {
    return this.request<{ id: number }>(`/plugins/${pluginKey}/configs/${configId}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鍒犻櫎鎻掍欢閰嶇疆
   */
  async deletePluginConfig(pluginKey: string, configId: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/plugins/${pluginKey}/configs/${configId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 鎵ц鎻掍欢鎼滃埉
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
   * 鎵归噺鎵ц鎻掍欢
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
   * 鑾峰彇鎵ц鐘舵€?
   */
  async getPluginExecution(executionId: number): Promise<PluginExecutionLog> {
    return this.request<PluginExecutionLog>(`/plugins/execution/${executionId}`);
  }

  /**
   * 鑾峰彇鎵ц鏃ュ織鍒楄〃
   */
  async getPluginExecutionLogs(pluginKey: string, mediaId?: number, limit: number = 10): Promise<PluginExecutionLog[]> {
    const params = new URLSearchParams();
    if (mediaId) params.append('mediaId', mediaId.toString());
    params.append('limit', limit.toString());
    return this.request<PluginExecutionLog[]>(`/plugins/${pluginKey}/logs?${params.toString()}`);
  }

  /**
   * 鍙栨秷鎵ц
   */
  async cancelPluginExecution(executionId: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/plugins/execution/${executionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 閲嶈瘯鎵ц
   */
  async retryPluginExecution(executionId: number): Promise<{ executionId: number; status: string }> {
    return this.request<{ executionId: number; status: string }>(`/plugins/execution/${executionId}/retry`, {
      method: 'POST',
    });
  }

  /**
   * ===== 涓婁紶妯″潡 API =====
   */

  /**
   * 鍒涘缓涓婁紶浠诲姟
   * 鏍规嵁璁捐鏂囨。锛屽鏋?MD5 鍖归厤宸插瓨鍦ㄧ殑浠诲姟锛屼細杩斿洖宸叉湁浠诲姟淇℃伅
   */
  async createUploadTask(dto: UploadRequest): Promise<UploadTask> {
    return this.request<UploadTask>('/media/upload-tasks', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 涓婁紶鍒嗙墖
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
   * 鑾峰彇涓婁紶浠诲姟淇℃伅
   */
  async getUploadTask(uploadId: string): Promise<UploadTask> {
    return this.request<UploadTask>(`/media/upload-tasks/${uploadId}`);
  }

  /**
   * 鍒犻櫎涓婁紶浠诲姟
   */
  async deleteUploadTask(uploadId: string): Promise<void> {
    await this.request(`/media/upload-tasks/${uploadId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 鍚堝苟鍒嗙墖锛屽垱寤哄緟鍙戝竷濯掍綋
   */
  async mergeUpload(dto: MergeUploadRequest): Promise<MergeUploadResponse> {
    const { upload_id, ...requestData } = dto;
    return this.request<MergeUploadResponse>(`/media/upload-tasks/${upload_id}/merge`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  /**
   * 鏍规嵁涓婁紶浠诲姟 ID 鐢熸垚寰呭彂甯冨獟浣?
   */
  async createStagingFromUpload(uploadId: string): Promise<CreateStagingResponse> {
    return this.request<CreateStagingResponse>(`/media/upload-tasks/${uploadId}/create-staging`, {
      method: 'POST',
    });
  }

  /**
   * 鏍规嵁鏂囦欢澶?ID 鐢熸垚寰呭彂甯冨獟浣?
   */
  async createStagingFromFolder(folderId: string): Promise<CreateStagingResponse> {
    return this.request<CreateStagingResponse>(`/media/upload-tasks/folders/${folderId}/create-staging`, {
      method: 'POST',
    });
  }

  /**
   * 鑾峰彇寰呭彂甯冨獟浣撳垪琛?
   */
  async getStagingMedias(): Promise<StagingMedia[]> {
    return this.request<StagingMedia[]>('/staging/list');
  }

  /**
   * 鑾峰彇寰呭彂甯冨獟浣撹鎯?
   */
  async getStagingMedia(id: string): Promise<StagingMediaDetail> {
    return this.request<StagingMediaDetail>(`/staging/${id}`);
  }

  /**
   * 鏇存柊寰呭彂甯冨獟浣撳厓鏁版嵁
   */
  async updateStagingMetadata(id: string, dto: UpdateStagingMetadataDto): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/staging/${id}/metadata`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鎼滃埉寰呭彂甯冨獟浣撳厓鏁版嵁
   */
  async scrapeStagingMetadata(stagingMediaId: string, dto: ScrapeStagingMetadataRequest): Promise<ScrapeStagingMetadataResponse> {
    return this.request<ScrapeStagingMetadataResponse>(`/staging/${stagingMediaId}/scrape-metadata`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 涓婁紶娴锋姤
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
   * 涓婁紶鑳屾櫙鍥?
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
   * 涓婁紶鎴浘
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
   * 鍒犻櫎寰呭彂甯冨獟浣?
   */
  async deleteStagingMedia(id: string): Promise<void> {
    await this.request(`/staging/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 鍙戝竷鍒板簱
   */
  async publishStagingMedia(id: string, dto: PublishRequest): Promise<PublishResponse> {
    return this.request<PublishResponse>(`/staging/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鑾峰彇濯掍綋搴撳垪琛紙鐢ㄤ簬鍙戝竷鏃堕€夋嫨锛?
   */
  async getLibrariesForPublish(): Promise<MediaLibrary[]> {
    return this.request<MediaLibrary[]>('/libraries');
  }

  /**
   * ===== 鏂囦欢澶逛笂浼?API =====
   */

  /**
   * 鍒涘缓鏂囦欢澶逛笂浼犱换鍔?
   */
  async createFolderUploadTask(dto: CreateFolderUploadRequest): Promise<FolderUploadTask> {
    return this.request<FolderUploadTask>('/media/upload-tasks/folders', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鑾峰彇鎵€鏈夋枃浠跺す涓婁紶浠诲姟
   */
  async getFolderUploadTasks(): Promise<FolderUploadTask[]> {
    return this.request<FolderUploadTask[]>('/media/upload-tasks/folders');
  }

  /**
   * 鑾峰彇鏂囦欢澶逛笂浼犺繘搴?
   */
  async getFolderUploadTask(folderId: string): Promise<FolderUploadTask> {
    return this.request<FolderUploadTask>(`/media/upload-tasks/folders/${folderId}`);
  }

  /**
   * 娣诲姞鏂囦欢鍒版枃浠跺す
   */
  async addFileToFolder(folderId: string, dto: AddFileToFolderRequest): Promise<UploadTask> {
    return this.request<UploadTask>(`/media/upload-tasks/folders/${folderId}/files`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * 鍒犻櫎鏂囦欢澶逛笂浼犱换鍔?
   */
  async deleteFolderUploadTask(folderId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/media/upload-tasks/folders/${folderId}`, {
      method: 'DELETE',
    });
  }

  /**
   * ===== 鏃ュ織绠＄悊 API =====
   */

  /**
   * 鑾峰彇鏃ュ織鍒楄〃
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
   * 鑾峰彇鏃ュ織缁熻
   */
  async getLogsStats(): Promise<LogsStats> {
    return this.request<LogsStats>('/logs/stats');
  }

  /**
   * 鑾峰彇鏃ュ織绾у埆閰嶇疆
   */
  async getLogLevelConfig(): Promise<LogLevelConfig> {
    return this.request<LogLevelConfig>('/logs/levels');
  }

  /**
   * 璁剧疆鏃ュ織绾у埆
   */
  async setLogLevel(level: LogLevel | string): Promise<SetLogLevelResponse> {
    return this.request<SetLogLevelResponse>('/logs/level', {
      method: 'PUT',
      body: JSON.stringify({ level }),
    });
  }

  /**
   * 鍒犻櫎鏃ф棩蹇?
   */
  async deleteOldLogs(beforeDate: string): Promise<DeleteLogsResponse> {
    return this.request<DeleteLogsResponse>(`/logs?beforeDate=${beforeDate}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
