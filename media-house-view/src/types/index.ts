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

/**
 * ===== 上传模块类型定义 =====
 */

/**
 * 上传任务状态
 */
export type UploadStatus = 'calculating' | 'preparing' | 'pending' | 'uploading' | 'paused' | 'completed' | 'cancelled' | 'failed';

/**
 * 待发布媒体状态
 */
export type StagingStatus = 'pending_edit' | 'pending_publish' | 'published';

/**
 * 上传任务
 */
export interface UploadTask {
  upload_id: string;
  file_name: string;
  file_size: number;
  file_md5: string;
  chunk_size: number;
  total_chunks: number;
  uploaded_chunks_num: number;
  uploaded_size: number;
  max_uploaded_chunk_index: number; // 最大已上传分片索引
  missing_chunks_in_uploaded_range?: number[]; // 已上传范围中缺少的分片索引
  progress?: number; // 进度百分比 (0-1)
  status: UploadStatus;
  mime_type?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  is_new?: boolean; // 仅在创建任务响应中出现
}

/**
 * 上传进度
 */
export interface UploadProgress {
  upload_id: string;
  file_name: string;
  file_size: number;
  uploaded_size: number;
  total_chunks: number;
  uploaded_chunks: number;
  progress: number;
  status: UploadStatus;
}

/**
 * 创建上传任务请求
 */
export interface UploadRequest {
  file_name: string;
  file_size: number;
  file_md5?: string;
  chunk_size?: number;
}

/**
 * 检查已上传分片响应
 */
export interface CheckChunksResponse {
  upload_id: string;
  from_index: number;
  to_index: number;
  all_uploaded: boolean;
  missing_chunks: number[];
}

/**
 * 合并上传请求
 */
export interface MergeUploadRequest {
  upload_id: string;
  type?: 'movie' | 'tvshow';
  title?: string;
}

/**
 * 合并上传成功响应
 */
export interface MergeUploadSuccessResponse {
  success: true;
  data: {
    media_id: string;
    status: string;
  };
}

/**
 * 合并上传失败响应（缺失分片）
 */
export interface MergeUploadFailureResponse {
  success: false;
  error: 'missing_chunks';
  missing_chunks: number[];
  uploaded_chunks_num: number;
}

/**
 * 合并上传响应
 */
export type MergeUploadResponse = MergeUploadSuccessResponse | MergeUploadFailureResponse;

/**
 * 上传分片响应
 */
export interface UploadChunkResponse {
  chunk_index: number;
  uploaded_chunks: number;
  progress: number;
}

/**
 * 待发布媒体
 */
export interface StagingMedia {
  id: string;
  upload_task_id?: string;
  type: 'movie' | 'tvshow';
  title?: string;
  original_title?: string;
  year?: number;
  studio?: string;
  runtime?: number;
  description?: string;
  video_path?: string;
  video_size?: number;
  poster_path?: string;
  fanart_path?: string;
  screenshots_path?: string;
  tags?: string;
  staff?: string;
  status: StagingStatus;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

/**
 * 待发布媒体详情
 */
export interface StagingMediaDetail extends StagingMedia {
  // 继承 StagingMedia，可能包含更详细信息
}

/**
 * 更新待发布媒体元数据请求
 */
export interface UpdateStagingMetadataDto {
  title?: string;
  original_title?: string;
  year?: number;
  studio?: string;
  runtime?: number;
  description?: string;
}

/**
 * 搜刮待发布媒体元数据请求
 */
export interface ScrapeStagingMetadataRequest {
  plugin_key: string;
  plugin_version: string;
  config_name?: string;
}

/**
 * 搜刮待发布媒体元数据响应
 */
export interface ScrapeStagingMetadataResponse {
  execution_id: number;
  status: string;
  staging_media_id: string;
}

/**
 * 发布到库请求
 */
export interface PublishRequest {
  library_id: number;
  media_name: string;
}

/**
 * 发布响应
 */
export interface PublishResponse {
  media_id: number;
  movie_id?: number;
  tv_show_id?: number;
  status: string;
}

/**
 * ===== 日志管理类型定义 =====
 */

/**
 * 日志级别
 */
export type LogLevel = 'Information' | 'Warning' | 'Error' | 'Debug' | 'Fatal';

/**
 * 日志条目
 */
export interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  messageTemplate?: string;
  level: LogLevel;
  properties?: string;
  exception?: string;
  source: string;
  sourceContext?: string;
  machineName?: string;
  threadId?: number;
  application?: string;
  key_id?: string;
  event_id?: { id: number; name: string };
}

/**
 * 日志分页响应
 */
export interface LogsPageResponse {
  items: LogEntry[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * 日志统计
 */
export interface LogsStats {
  Information: number;
  Warning: number;
  Error: number;
  Debug: number;
  [key: string]: number;
}

/**
 * 日志查询参数
 */
export interface LogsQueryParams {
  page?: number;
  pageSize?: number;
  level?: string; // 支持逗号分隔的多个级别
  startTime?: string;
  endTime?: string;
  category?: string;
  message?: string;
  machineName?: string;
  hasException?: boolean;
  sortBy?: 'id' | 'timestamp';
  sortOrder?: 'asc' | 'desc';
  fromId?: number;
  toId?: number;
  limit?: number;
}

/**
 * 删除日志响应
 */
export interface DeleteLogsResponse {
  message: string;
}

/**
 * 日志级别配置
 */
export interface LogLevelConfig {
  Default: string;
}

/**
 * 设置日志级别请求
 */
export interface SetLogLevelRequest {
  level: LogLevel;
}

/**
 * 设置日志级别响应
 */
export interface SetLogLevelResponse {
  message: string;
}
