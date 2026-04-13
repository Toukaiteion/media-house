export interface MediaLibrary {
  id: number;
  name: string;
  type: 'Movie' | 'TVShow';
  path: string;
  status: 'Idle' | 'Scanning' | 'Error';
  createdAt: string;
  updatedAt: string;
  isEnabled: boolean;
}

export interface PageDto<T> {
  items: T[];
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface CreateMediaLibraryDto {
  name: string;
  type: 'Movie' | 'TVShow';
  path: string;
}

export interface UpdateMediaLibraryDto {
  name: string;
  type: 'Movie' | 'TVShow';
  path: string;
  isEnabled: boolean;
}

export interface Movie {
  id: number;
  title: string;
  year?: number;
  posterPath?: string;
  overview?: string;
  createdAt: string;
  mediaLibraryId: number;
  filePath?: string;
  containerFormat?: string;
  width?: number;
  height?: number;
  duration?: number;
  fileSize?: number;
}

export interface TVShow {
  id: number;
  title: string;
  year?: number;
  posterPath?: string;
  overview?: string;
  createdAt: string;
  mediaLibraryId: number;
}

export interface Season {
  id: number;
  seasonNumber: number;
  tvShowId: number;
  createdAt: string;
  episodeCount: number;
}

export interface Episode {
  id: number;
  episodeNumber: number;
  fileName: string;
  title?: string;
  overview?: string;
  seasonId: number;
  filePath?: string;
  containerFormat?: string;
  duration?: number;
  fileSize?: number;
}

export interface PlaybackUrl {
  url: string;
  mimeType?: string;
  canDirectPlay: boolean;
}

export interface PlaybackProgress {
  id: number;
  userId: string;
  movieId?: number;
  episodeId?: number;
  position: number;
  duration?: number;
  lastPlayed: string;
  isCompleted: boolean;
}

export interface ScanLog {
  id: number;
  mediaLibraryId: number;
  syncType: 'FullScan' | 'IncrementalScan' | 'FileChange' | 'ManualSync';
  status: 'Started' | 'InProgress' | 'Completed' | 'Failed';
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
  startTime: string;
  endTime?: string;
  errorMessage?: string;
}

// ===== 新增类型定义 =====

/**
 * 标签类型
 */
export interface PageTag {
  page: number;
  page_size: number;
  total_count: number;
  tags: Tag[];
}

export interface Tag {
  id: string;
  tag_name: string;
  media_count?: number;
}

/**
 * 演员类型
 */
export interface PageActor {
  page: number;
  page_size: number;
  total_count: number;
  actors: Actor[];
}

export interface Actor {
  id: string;
  name: string;
  avatar_path?: string;
  type?: string;
  country?: string;
  media_count?: number;
}

/**
 * 演员角色信息（用于电影详情）
 */
export interface ActorRole {
  id: string;
  name: string;
  avatar_path?: string;
  role_name?: string;
}

/**
 * 人员信息（导演、编剧等）
 */
export interface Person {
  id: string;
  name: string;
}

/**
 * 截图信息
 */
export interface Screenshot {
  url_name: string;
  name: string;
  path: string;
  width: number;
  height: number;
  size_bytes: number;
}

/**
 * 电影详情（包含完整信息）
 */
export interface MoviesPage {
  items: MovieDetail[];
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface MovieDetail {
  id: string;
  title: string;
  original_title?: string;
  year: number;
  release_date?: string;
  poster_path?: string;
  thumb_path?: string;
  fanart_path?: string;
  overview?: string;
  created_at: string;
  media_library_id: string;
  file_path?: string;
  container_format?: string;
  duration?: number;
  file_size?: number;
  num?: string;
  studio?: string;
  maker?: string;
  screenshots?: Screenshot[];
  actors?: ActorRole[];
  directors?: Person[];
  writers?: Person[];
  tags?: Tag[];
  play_count?: number;
  is_favorited?: boolean;
}

/**
 * 电影列表查询参数
 */
export interface MovieListParams {
  page?: number;
  pageSize?: number;
  libraryId?: number;
  tags?: string;
  actorId?: number;
  userId?: number;
  favor?: boolean;
  search?: string;
  sortBy?: 'default' | 'recent' | 'mostly_play' | 'name' | 'release_date' | 'create_time';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 播放记录
 */
export interface PlayRecord {
  id: number;
  user_id: number;
  media_library_id: number;
  media_id: number;
  position_ms: number;
  is_finished: boolean;
  last_play_time: string;
  created_at: string;
  updated_at: string;
}

/**
 * 创建/更新播放记录请求体
 */
export interface PlayRecordDto {
  user_id: number;
  position_seconds: number;
}

/**
 * 播放媒体请求体
 */
export interface PlayMediaDto {
  user_id: number;
  position_seconds: number;
}

/**
 * 收藏响应
 */
export interface FavoriteResponse {
  is_favorited: boolean;
  message: string;
}

/**
 * 健康检查响应
 */
export interface HealthCheckResponse {
  status: string;
  timestamp: string;
}

/**
 * 删除媒体响应
 */
export interface DeleteMediaResponse {
  message: string;
}

/**
 * 错误响应
 */
export interface ErrorResponse {
  error: string;
}

/**
 * 分页响应头
 */
export interface PaginationHeaders {
  'X-Total-Count'?: string;
}

/**
 * 推荐接口参数
 */
export interface RecommendParams {
  tagNum?: number;
  mediaNum?: number;
  mediaSearchType?: 'create_time' | 'random';
}

/**
 * 基于标签的推荐
 */
export interface TagRecommendation {
  id: string;
  tag_name: string;
  media_count: number;
  movies: MovieDetail[];
}

/**
 * 基于演员的推荐
 */
export interface ActorRecommendation {
  id: string;
  name: string;
  media_count: number;
  movies: MovieDetail[];
}

/**
 * 登录请求
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 登录响应
 */
export interface LoginResponse {
  token: string;
  user_id: number;
  username: string;
}

/**
 * 注册请求
 */
export interface RegisterRequest {
  username: string;
  password: string;
  email: string;
}

/**
 * 注册响应
 */
export interface RegisterResponse {
  token: string;
  user_id: number;
  username: string;
}

/**
 * 更新元数据请求
 */
export interface UpdateMetadataDto {
  title?: string;
  summary?: string;
  tags?: string[];
  actors?: Array<{ name: string; sortOrder: number }>;
}

/**
 * 用户相关类型
 */
export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  create_time: string;
  update_time: string;
}

export interface UpdateCurrentUserDto {
  email?: string;
  current_password?: string;
  new_password?: string;
}

export interface CreateUserDto {
  username: string;
  password: string;
  email: string;
}

export interface UpdateUserDto {
  email?: string;
  isActive?: boolean;
}

export interface ChangePasswordDto {
  current_password: string;
  new_password: string;
}

export interface DeleteAccountDto {
  password: string;
}

export interface UserPageResponse {
  items: User[];
  total_count: number;
  page: number;
  page_size: number;
}

/**
 * 插件相关类型定义
 */

/**
 * 插件配置Schema字段类型
 */
export interface PluginConfigSchemaField {
  type: 'select' | 'boolean' | 'number' | 'string';
  label: string;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

/**
 * 插件配置Schema
 */
export interface PluginConfigSchema {
  [key: string]: PluginConfigSchemaField;
}

/**
 * 运行要求
 */
export interface RuntimeRequirements {
  max_execution_time_seconds?: number;
  min_memory_mb?: number;
}

/**
 * 插件信息
 */
export interface Plugin {
  id: string;
  plugin_key: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  is_enabled: boolean;
  is_installed: boolean;
  supported_media_types: string[];
  supported_languages?: string[];
  config_schema?: PluginConfigSchema;
  runtime_requirements?: RuntimeRequirements;
  plugin_dir?: string;
  entry_point?: string;
  supported_identifiers?: string[];
  create_time?: string;
  update_time?: string;
}

/**
 * 插件倒装响应
 */
export interface PluginInstallResponse {
  plugin_key: string;
  version: string;
  plugin_dir: string;
}

/**
 * 插件配置
 */
export interface PluginConfig {
  id: number;
  plugin_key: string;
  plugin_version?: string;
  library_id?: number;
  config_name: string;
  is_active: boolean;
  config_data: Record<string, any>;
  create_time: string;
  update_time: string;
}

/**
 * 插件执行日志
 */
export interface PluginExecutionLog {
  id: number;
  plugin_key: string;
  plugin_version?: string;
  media_library_id?: number;
  media_id?: number;
  execution_type: 'manual' | 'auto' | 'batch';
  source_dir?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
  error_message?: string;
  progress_percent: number;
  current_step?: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  metadata_output?: Record<string, any>;
  created_files?: Record<string, any>;
  statistics?: Record<string, any>;
  log_messages?: string;
}

/**
 * 插件执行响应
 */
export interface PluginExecutionResponse {
  execution_id: number;
  status: string;
}
