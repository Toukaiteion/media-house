-- Migration script: Rename plugin_id to plugin_key in all plugin-related tables
-- This migration handles the renaming of the plugin_id column to plugin_key to avoid ambiguity
-- between the database primary key (id) and the business key (plugin_key)

BEGIN TRANSACTION;

-- Migrate plugins table
-- Create new table with plugin_key column
CREATE TABLE plugins_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plugin_key VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    author VARCHAR(100),
    homepage VARCHAR(255),
    entry_point VARCHAR(100) DEFAULT 'bin/scraper',
    supported_media_types VARCHAR(100) DEFAULT 'movie',
    supported_languages VARCHAR(200) DEFAULT 'zh-CN',
    plugin_dir VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN DEFAULT 1,
    is_installed BOOLEAN DEFAULT 1,
    config_schema TEXT,
    runtime_requirements TEXT,
    create_time TIMESTAMP DEFAULT (datetime('now','localtime')),
    update_time TIMESTAMP DEFAULT (datetime('now','localtime')),
    UNIQUE(plugin_key, version)
);

-- Copy data from old table to new table
INSERT INTO plugins_new (id, plugin_key, version, name, description, author, homepage,
                      entry_point, supported_media_types, supported_languages,
                      plugin_dir, is_enabled, is_installed, config_schema,
                      runtime_requirements, create_time, update_time)
SELECT id, plugin_id, version, name, description, author, homepage,
       entry_point, supported_media_types, supported_languages,
       plugin_dir, is_enabled, is_installed, config_schema,
       runtime_requirements, create_time, update_time
FROM plugins;

-- Drop old table and rename new table
DROP TABLE plugins;
ALTER TABLE plugins_new RENAME TO plugins;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_plugins_plugin_key ON plugins(plugin_key);

-- Migrate plugin_configs table
CREATE TABLE plugin_configs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plugin_key VARCHAR(50) NOT NULL,
    plugin_version VARCHAR(20),
    library_id INTEGER,
    config_name VARCHAR(100) DEFAULT 'default',
    config_data TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    create_time TIMESTAMP DEFAULT (datetime('now','localtime')),
    update_time TIMESTAMP DEFAULT (datetime('now','localtime')),
    UNIQUE(plugin_key, library_id, config_name)
);

INSERT INTO plugin_configs_new (id, plugin_key, plugin_version, library_id,
                               config_name, config_data, is_active,
                               create_time, update_time)
SELECT id, plugin_id, plugin_version, library_id,
       config_name, config_data, is_active,
       create_time, update_time
FROM plugin_configs;

DROP TABLE plugin_configs;
ALTER TABLE plugin_configs_new RENAME TO plugin_configs;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_plugin_configs_plugin_key ON plugin_configs(plugin_key);
CREATE INDEX IF NOT EXISTS idx_plugin_configs_library_id ON plugin_configs(library_id);

-- Migrate plugin_execution_logs table
CREATE TABLE plugin_execution_logs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plugin_key VARCHAR(50) NOT NULL,
    plugin_version VARCHAR(20),
    media_library_id INTEGER,
    media_id INTEGER,
    execution_type VARCHAR(50) NOT NULL,
    source_dir VARCHAR(500),
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    progress_percent INTEGER DEFAULT 0,
    current_step VARCHAR(50),
    start_time TIMESTAMP DEFAULT (datetime('now','localtime')),
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    metadata_output TEXT,
    created_files TEXT,
    statistics TEXT
);

INSERT INTO plugin_execution_logs_new (id, plugin_key, plugin_version, media_library_id,
                                    media_id, execution_type, source_dir,
                                    status, error_message, progress_percent,
                                    current_step, start_time, end_time,
                                    duration_seconds, metadata_output,
                                    created_files, statistics)
SELECT id, plugin_id, plugin_version, media_library_id,
       media_id, execution_type, source_dir,
       status, error_message, progress_percent,
       current_step, start_time, end_time,
       duration_seconds, metadata_output,
       created_files, statistics
FROM plugin_execution_logs;

DROP TABLE plugin_execution_logs;
ALTER TABLE plugin_execution_logs_new RENAME TO plugin_execution_logs;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_plugin_execution_logs_plugin_key ON plugin_execution_logs(plugin_key);
CREATE INDEX IF NOT EXISTS idx_plugin_execution_logs_media_id ON plugin_execution_logs(media_id);
CREATE INDEX IF NOT EXISTS idx_plugin_execution_logs_status ON plugin_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_plugin_execution_logs_start_time ON plugin_execution_logs(start_time);

COMMIT;
