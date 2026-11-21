-- 演员 / 标签收藏表
-- Migration date: 2026-11-21
--
-- 说明：项目使用 EF Core EnsureCreated()，它只在数据库不存在时建表。
-- 已部署的库需要手动执行本脚本，否则收藏接口会报表不存在。
-- MySQL / MariaDB 的建表语句见文件末尾注释。

CREATE TABLE IF NOT EXISTS favorite_staffs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    staff_id    INTEGER NOT NULL,
    create_time TIMESTAMP NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (user_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_staffs_user  ON favorite_staffs (user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_staffs_staff ON favorite_staffs (staff_id);

CREATE TABLE IF NOT EXISTS favorite_tags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    tag_id      INTEGER NOT NULL,
    create_time TIMESTAMP NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_tags_user ON favorite_tags (user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_tags_tag  ON favorite_tags (tag_id);

-- ---------------------------------------------------------------------------
-- MySQL / MariaDB:
--
-- CREATE TABLE IF NOT EXISTS favorite_staffs (
--     id          INT AUTO_INCREMENT PRIMARY KEY,
--     user_id     INT NOT NULL,
--     staff_id    INT NOT NULL,
--     create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     UNIQUE KEY uk_favorite_staffs_user_staff (user_id, staff_id),
--     KEY idx_favorite_staffs_user (user_id),
--     KEY idx_favorite_staffs_staff (staff_id)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--
-- CREATE TABLE IF NOT EXISTS favorite_tags (
--     id          INT AUTO_INCREMENT PRIMARY KEY,
--     user_id     INT NOT NULL,
--     tag_id      INT NOT NULL,
--     create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     UNIQUE KEY uk_favorite_tags_user_tag (user_id, tag_id),
--     KEY idx_favorite_tags_user (user_id),
--     KEY idx_favorite_tags_tag (tag_id)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
