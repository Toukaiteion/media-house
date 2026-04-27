-- 设置字符集
SET NAMES utf8mb4;

-- ==============================
-- 1. 媒体库表
-- ==============================
DROP TABLE IF EXISTS media_libraries;
CREATE TABLE media_libraries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '库名',
    type VARCHAR(20) NOT NULL COMMENT '类型: movie/tv',
    path VARCHAR(500) NOT NULL COMMENT '库路径',
    status VARCHAR(20) DEFAULT NULL,
    is_enabled TINYINT(1) DEFAULT 1,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='媒体库表';

-- ==============================
-- 2. 媒体元数据表
-- ==============================
DROP TABLE IF EXISTS medias;
CREATE TABLE medias (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    library_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(20) NOT NULL COMMENT '类型: movie,tvshow,season,episode',
    parent_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父级ID',
    name VARCHAR(100) NOT NULL COMMENT '媒体名',
    title VARCHAR(1024) NOT NULL COMMENT '标题',
    original_title VARCHAR(1024) DEFAULT NULL COMMENT '原始标题',
    release_date VARCHAR(20) DEFAULT NULL COMMENT '上映日期',
    summary VARCHAR(4096) DEFAULT NULL COMMENT '简介',
    poster_path VARCHAR(255) DEFAULT NULL,
    thumb_path VARCHAR(255) DEFAULT NULL,
    fanart_path VARCHAR(255) DEFAULT NULL,
    play_count INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_library_id (library_id),
    INDEX idx_type (type),
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='媒体元数据表';

-- ==============================
-- 3. 电影详细信息表
-- ==============================
DROP TABLE IF EXISTS movies;
CREATE TABLE movies (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    library_id BIGINT UNSIGNED NOT NULL,
    media_id BIGINT UNSIGNED NOT NULL,
    num VARCHAR(64) DEFAULT NULL COMMENT '编号/排序号',
    studio VARCHAR(255) DEFAULT NULL COMMENT '制片公司',
    maker VARCHAR(100) DEFAULT NULL COMMENT '制作公司',
    runtime INT DEFAULT NULL COMMENT '时长(分钟)',
    description TEXT COMMENT '详细描述',
    screenshots_path VARCHAR(4096) DEFAULT NULL COMMENT '截图路径',
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_media_id (media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电影详细信息表';

-- ==============================
-- 4. 媒体文件表
-- ==============================
DROP TABLE IF EXISTS media_files;
CREATE TABLE media_files (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    media_id BIGINT UNSIGNED NOT NULL,
    path VARCHAR(500) NOT NULL COMMENT '文件路径',
    file_name VARCHAR(255) NOT NULL,
    extension VARCHAR(10) DEFAULT NULL,
    container VARCHAR(20) DEFAULT NULL,
    video_codec VARCHAR(20) DEFAULT NULL,
    runtime INT DEFAULT NULL,
    width INT DEFAULT NULL,
    height INT DEFAULT NULL,
    audio_codec VARCHAR(20) DEFAULT NULL,
    size_bytes BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_path (path),
    INDEX idx_media_id (media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='媒体文件表';

-- ==============================
-- 5. 图片资源表
-- ==============================
DROP TABLE IF EXISTS media_imgs;
CREATE TABLE media_imgs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    media_id BIGINT UNSIGNED DEFAULT NULL,
    url_name VARCHAR(128) NOT NULL COMMENT '例如 p300111.jpg',
    name VARCHAR(128) NOT NULL,
    path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    extension VARCHAR(10) DEFAULT NULL,
    type VARCHAR(20) DEFAULT NULL COMMENT 'poster, thumb, fanart',
    width INT DEFAULT NULL,
    height INT DEFAULT NULL,
    size_bytes BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_url_name (url_name),
    UNIQUE KEY uk_path (path),
    INDEX idx_media_id (media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='图片资源表';

-- ==============================
-- 6. 标签表
-- ==============================
DROP TABLE IF EXISTS tags;
CREATE TABLE tags (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tag_name VARCHAR(50) NOT NULL,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tag_name (tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标签表';

-- ==============================
-- 7. 媒体标签绑定表
-- ==============================
DROP TABLE IF EXISTS media_tags;
CREATE TABLE media_tags (
    media_library_id BIGINT UNSIGNED NOT NULL,
    media_type VARCHAR(20) NOT NULL,
    media_id BIGINT UNSIGNED NOT NULL,
    tag_id BIGINT UNSIGNED NOT NULL,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (media_library_id, media_id, tag_id),
    INDEX idx_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='媒体标签绑定表';

-- ==============================
-- 8. 用户表
-- ==============================
DROP TABLE IF EXISTS app_users;
CREATE TABLE app_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ==============================
-- 9. 我的收藏表
-- ==============================
DROP TABLE IF EXISTS my_favors;
CREATE TABLE my_favors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    library_id BIGINT UNSIGNED NOT NULL,
    media_type VARCHAR(20) NOT NULL,
    media_id BIGINT UNSIGNED NOT NULL,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_media (user_id, media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='我的收藏表';

-- ==============================
-- 10. 播放记录表
-- ==============================
DROP TABLE IF EXISTS play_records;
CREATE TABLE play_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    library_id BIGINT UNSIGNED NOT NULL,
    media_type VARCHAR(20) NOT NULL,
    media_id BIGINT UNSIGNED NOT NULL,
    position_ms BIGINT DEFAULT 0 COMMENT '播放进度(毫秒)',
    is_finished TINYINT(1) DEFAULT 0,
    last_play_time TIMESTAMP NULL DEFAULT NULL,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_media (user_id, media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='播放记录表';

-- ==============================
-- 11. 人员表 (导演/演员)
-- ==============================
DROP TABLE IF EXISTS staffs;
CREATE TABLE staffs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    avatar_path VARCHAR(255) DEFAULT NULL,
    country VARCHAR(50) DEFAULT NULL,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员表';

-- ==============================
-- 12. 媒体人员关联表
-- ==============================
DROP TABLE IF EXISTS media_staffs;
CREATE TABLE media_staffs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    media_type VARCHAR(20) NOT NULL,
    media_id BIGINT UNSIGNED NOT NULL,
    staff_id BIGINT UNSIGNED NOT NULL,
    role_type VARCHAR(20) NOT NULL COMMENT 'director/actor/writer',
    role_name VARCHAR(100) DEFAULT NULL COMMENT '饰演角色',
    sort_order INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_media (media_type, media_id),
    INDEX idx_staff (staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='媒体人员关联表';

-- ==============================
-- 13. 系统同步日志表
-- ==============================
DROP TABLE IF EXISTS system_sync_logs;
CREATE TABLE system_sync_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    media_library_id BIGINT UNSIGNED NOT NULL,
    sync_type VARCHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL,
    added_count INT DEFAULT 0,
    updated_count INT DEFAULT 0,
    deleted_count INT DEFAULT 0,
    error_message VARCHAR(1024) DEFAULT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_library_time (media_library_id, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统同步日志表';

-- ==============================
-- 14. 插件表
-- ==============================
DROP TABLE IF EXISTS plugins;
CREATE TABLE plugins (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plugin_key VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    author VARCHAR(100) DEFAULT NULL,
    homepage VARCHAR(255) DEFAULT NULL,
    entry_point VARCHAR(100) DEFAULT 'bin/scraper',
    supported_media_types VARCHAR(100) DEFAULT 'movie',
    supported_languages VARCHAR(200) DEFAULT 'zh-CN',
    plugin_dir VARCHAR(255) NOT NULL,
    is_enabled TINYINT(1) DEFAULT 1,
    is_installed TINYINT(1) DEFAULT 1,
    config_schema TEXT,
    runtime_requirements TEXT,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_plugin_key_version (plugin_key, version),
    INDEX idx_plugin_key (plugin_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='插件表';

-- ==============================
-- 15. 插件配置表
-- ==============================
DROP TABLE IF EXISTS plugin_configs;
CREATE TABLE plugin_configs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plugin_id BIGINT UNSIGNED NOT NULL,
    plugin_key VARCHAR(50) NOT NULL,
    plugin_version VARCHAR(20) DEFAULT NULL,
    config_name VARCHAR(100) DEFAULT 'default',
    config_data TEXT NOT NULL,
    is_active TINYINT(1) DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_plugin_config (plugin_key, config_name),
    INDEX idx_plugin_key (plugin_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='插件配置表';

-- ==============================
-- 16. 插件执行日志表
-- ==============================
DROP TABLE IF EXISTS plugin_execution_logs;
CREATE TABLE plugin_execution_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plugin_key VARCHAR(50) NOT NULL,
    plugin_version VARCHAR(20) DEFAULT NULL,
    config_id BIGINT UNSIGNED DEFAULT NULL,
    business_id BIGINT UNSIGNED DEFAULT NULL,
    input TEXT,
    business_type VARCHAR(64) DEFAULT NULL,
    execution_type VARCHAR(50) NOT NULL,
    source_dir VARCHAR(500) DEFAULT NULL,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    log_messages TEXT,
    progress_percent INT DEFAULT 0,
    current_step VARCHAR(50) DEFAULT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL DEFAULT NULL,
    duration_seconds INT DEFAULT NULL,
    metadata_output TEXT,
    created_files TEXT,
    statistics TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_retry_time TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_plugin_key (plugin_key),
    INDEX idx_business_id (business_id),
    INDEX idx_status (status),
    INDEX idx_start_time (start_time),
    INDEX idx_config_id (config_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='插件执行日志表';

-- ==============================
-- 17. 上传任务表
-- ==============================
DROP TABLE IF EXISTS upload_tasks;
CREATE TABLE upload_tasks (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID',
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_md5 VARCHAR(32) DEFAULT NULL,
    chunk_size INT NOT NULL,
    total_chunks INT NOT NULL,
    uploaded_chunks_num INT DEFAULT 0,
    uploaded_size BIGINT DEFAULT 0,
    status INT DEFAULT 0 COMMENT '0=待上传,1=上传中,2=已完成,3=已取消,4=失败',
    mime_type VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_status (status),
    INDEX idx_file_md5 (file_md5),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='上传任务表';

-- ==============================
-- 18. 待发布媒体表
-- ==============================
DROP TABLE IF EXISTS staging_medias;
CREATE TABLE staging_medias (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID',
    upload_task_id VARCHAR(36) NOT NULL,
    type VARCHAR(20) NOT NULL COMMENT 'movie, tvshow',
    code VARCHAR(32) DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    original_title VARCHAR(255) DEFAULT NULL,
    year INT DEFAULT NULL,
    release_date VARCHAR(24) DEFAULT NULL,
    studio VARCHAR(255) DEFAULT NULL,
    runtime INT DEFAULT NULL,
    description TEXT,
    video_path VARCHAR(500) NOT NULL,
    video_size BIGINT NOT NULL,
    poster_path VARCHAR(500) DEFAULT NULL,
    thumb_path VARCHAR(500) DEFAULT NULL,
    fanart_path VARCHAR(500) DEFAULT NULL,
    screenshots_path VARCHAR(2048) DEFAULT NULL,
    tags TEXT COMMENT 'JSON数组',
    staff TEXT COMMENT 'JSON数组',
    status INT DEFAULT 0 COMMENT '0=待编辑,1=待发布,2=已发布',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_status (status),
    INDEX idx_upload_task_id (upload_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='待发布媒体表';
