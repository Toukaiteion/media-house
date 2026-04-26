# MediaHouse Admin Database Configuration

本文档详细说明了 MediaHouse Admin 的数据库配置方式，支持 SQLite、MySQL 和 MariaDB 三种数据库。

## 配置优先级

配置按以下优先级加载（从高到低）：

1. **环境变量** (最高优先级) - 适合容器化部署
2. `appsettings.{Environment}.json` - 如 `appsettings.Development.json`
3. `appsettings.json` (最低优先级) - 默认配置

## 配置方式

### 方式一：使用 appsettings.json（默认）

#### SQLite 配置

```json
{
  "Database": {
    "Provider": "Sqlite",
    "Sqlite": {
      "DefaultConnection": "Data Source=mediahouse.db",
      "Logger": "Data Source=mediahouse-logs.db",
      "LoggerPath": "./mediahouse-logs.db"
    }
  }
}
```

#### MySQL/MariaDB 配置

```json
{
  "Database": {
    "Provider": "MySql",
    "MySql": {
      "DefaultConnection": "Server=localhost;Port=3306;Database=mediahouse;User=root;Password=secret;",
      "Logger": "Server=localhost;Port=3306;Database=mediahouse_logs;User=root;Password=secret;"
    }
  }
}
```

**注意**：MariaDB 使用与 MySQL 相同的配置格式和驱动程序，只需将 `Provider` 设置为 `MariaDB` 即可。

### 方式二：使用环境变量

环境变量以 `MH_` 为前缀，可以覆盖所有配置项。嵌套配置使用 `__` (双下划线) 分隔。

#### SQLite 环境变量

```bash
# 选择数据库提供程序
export MH_Database__Provider=Sqlite

# 主数据库路径
export MH_Database__Sqlite__DefaultConnection="Data Source=/data/mediahouse.db"

# 日志数据库连接字符串
export MH_Database__Sqlite__Logger="Data Source=/data/mediahouse-logs.db"

# 日志数据库路径（用于 Serilog）
export MH_Database__Sqlite__LoggerPath="/data/mediahouse-logs.db"
```

#### MySQL/MariaDB 环境变量

```bash
# 选择数据库提供程序
export MH_Database__Provider=MySql

# 主数据库连接字符串
export MH_Database__MySql__DefaultConnection="Server=localhost;Port=3306;Database=mediahouse;User=root;Password=secret;"

# 日志数据库连接字符串
export MH_Database__MySql__Logger="Server=localhost;Port=3306;Database=mediahouse_logs;User=root;Password=secret;"
```

#### 其他配置示例

```bash
# JWT 配置
export MH_Jwt__Secret="your-secret-key"
export MH_Jwt__ExpirationMinutes=1440

# 上传配置
export MH_UploadSettings__UploadPath="/app/uploads"
export MH_UploadSettings__ChunkSize=5242880

# 插件配置
export MH_PluginSettings__PluginPath="/app/plugins"
```

#### 环境变量映射表

| 环境变量 | appsettings.json 路径 | 说明 |
|---------|---------------------|------|
| `MH_Database__Provider` | `Database:Provider` | 数据库提供程序：`Sqlite`、`MySql`、`MariaDB` |
| `MH_Database__Sqlite__DefaultConnection` | `Database:Sqlite:DefaultConnection` | SQLite 主数据库连接字符串 |
| `MH_Database__Sqlite__Logger` | `Database:Sqlite:Logger` | SQLite 日志数据库连接字符串 |
| `MH_Database__Sqlite__LoggerPath` | `Database:Sqlite:LoggerPath` | SQLite 日志数据库路径（Serilog 用） |
| `MH_Database__MySql__DefaultConnection` | `Database:MySql:DefaultConnection` | MySQL/MariaDB 主数据库连接字符串 |
| `MH_Database__MySql__Logger` | `Database:MySql:Logger` | MySQL/MariaDB 日志数据库连接字符串 |

## Docker 部署示例

### SQLite (单文件部署)

```yaml
version: '3.8'
services:
  mediahouse:
    image: mediahouse-admin
    ports:
      - "5000:5000"
    volumes:
      - ./data:/data
    environment:
      - MH_Database__Provider=Sqlite
      - MH_Database__Sqlite__DefaultConnection=Data Source=/data/mediahouse.db
      - MH_Database__Sqlite__Logger=Data Source=/data/mediahouse-logs.db
      - MH_Database__Sqlite__LoggerPath=/data/mediahouse-logs.db
```

### MySQL

```yaml
version: '3.8'
services:
  mediahouse:
    image: mediahouse-admin
    ports:
      - "5000:5000"
    environment:
      - MH_Database__Provider=MySql
      - MH_Database__MySql__DefaultConnection=Server=db;Port=3306;Database=mediahouse;User=root;Password=secret;
      - MH_Database__MySql__Logger=Server=db;Port=3306;Database=mediahouse_logs;User=root;Password=secret;
    depends_on:
      - db

  db:
    image: mysql:8
    environment:
      - MYSQL_ROOT_PASSWORD=secret
      - MYSQL_DATABASE=mediahouse
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

### MariaDB

```yaml
version: '3.8'
services:
  mediahouse:
    image: mediahouse-admin
    ports:
      - "5000:5000"
    environment:
      - MH_Database__Provider=MariaDB
      - MH_Database__MySql__DefaultConnection=Server=db;Port=3306;Database=mediahouse;User=root;Password=secret;
      - MH_Database__MySql__Logger=Server=db;Port=3306;Database=mediahouse_logs;User=root;Password=secret;
    depends_on:
      - db

  db:
    image: mariadb:10
    environment:
      - MYSQL_ROOT_PASSWORD=secret
      - MYSQL_DATABASE=mediahouse
    volumes:
      - mariadb_data:/var/lib/mysql

volumes:
  mariadb_data:
```

## Kubernetes 部署示例

### ConfigMap (可选配置)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mediahouse-config
data:
  MH_Database__Provider: "MySql"
  MH_Database__MySql__DefaultConnection: "Server=mysql-service;Port=3306;Database=mediahouse;User=root;Password=secret;"
  MH_Database__MySql__Logger: "Server=mysql-service;Port=3306;Database=mediahouse_logs;User=root;Password=secret;"
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mediahouse
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mediahouse
  template:
    metadata:
      labels:
        app: mediahouse
    spec:
      containers:
      - name: mediahouse
        image: mediahouse-admin:latest
        ports:
        - containerPort: 5000
        envFrom:
        - configMapRef:
            name: mediahouse-config
        env:
        - name: MH_Database__Provider
          value: "MySql"
        - name: MH_Database__MySql__DefaultConnection
          value: "Server=mysql-service;Port=3306;Database=mediahouse;User=root;Password=secret;"
        - name: MH_Database__MySql__Logger
          value: "Server=mysql-service;Port=3306;Database=mediahouse_logs;User=root;Password=secret;"
```

## 连接字符串格式

### SQLite

```
Data Source=path/to/database.db
```

示例：
- `Data Source=mediahouse.db` (当前目录)
- `Data Source=/data/mediahouse.db` (绝对路径)
- `Data Source=./data/mediahouse.db` (相对路径)

### MySQL/MariaDB

```
Server=host;Port=port;Database=database;User=username;Password=password;
```

示例：
- `Server=localhost;Port=3306;Database=mediahouse;User=root;Password=secret;`
- `Server=192.168.1.100;Port=3306;Database=mediahouse;User=appuser;Password=appsecret;`
- `Server=db.example.com;Port=3306;Database=mediahouse;User=appuser;Password=appsecret;SslMode=Required;`

可选参数：
- `SslMode` - SSL 连接模式：`None`、`Required`、`Preferred`、`Auto`
- `ConnectionTimeout` - 连接超时（秒）
- `DefaultCommandTimeout` - 命令超时（秒）

## 验证配置

### 1. 测试 SQLite 默认配置

```bash
# 不设置任何环境变量，使用 appsettings.json 中的默认配置
dotnet run --project media-house-admin
```

验证数据库文件是否创建：
- `mediahouse.db` (主数据库)
- `mediahouse-logs.db` (日志数据库)

### 2. 测试 SQLite 环境变量

```bash
export MH_Database__Provider=Sqlite
export MH_Database__Sqlite__DefaultConnection="Data Source=/tmp/test.db"
export MH_Database__Sqlite__Logger="Data Source=/tmp/test-logs.db"
export MH_Database__Sqlite__LoggerPath="/tmp/test-logs.db"
dotnet run --project media-house-admin
```

验证数据库文件是否创建在 `/tmp/` 目录。

### 3. 测试 MySQL 环境变量

```bash
export MH_Database__Provider=MySql
export MH_Database__MySql__DefaultConnection="Server=localhost;Port=3306;Database=mediahouse;User=root;Password=yourpassword;"
export MH_Database__MySql__Logger="Server=localhost;Port=3306;Database=mediahouse_logs;User=root;Password=yourpassword;"
dotnet run --project media-house-admin
```

验证：
1. 检查数据库连接是否成功
2. 检查 `mediahouse` 和 `mediahouse_logs` 数据库是否创建

### 4. 验证 Serilog 日志

检查 `system_logs` 表是否有日志记录：

```bash
# SQLite
sqlite3 mediahouse-logs.db "SELECT * FROM system_logs LIMIT 10;"

# MySQL
mysql -u root -p mediahouse_logs -e "SELECT * FROM system_logs LIMIT 10;"
```

## 故障排查

### 问题：数据库连接失败

**检查点：**
1. 确认环境变量使用 `MH_` 前缀，嵌套使用 `__` 分隔
2. 确认连接字符串格式正确
3. MySQL/MariaDB：确认服务器地址、端口、用户名、密码正确
4. SQLite：确认有写入权限

### 问题：日志未写入数据库

**检查点：**
1. 确认 `MH_Database__Sqlite__LoggerPath` 或 `MH_Database__MySql__Logger` 已设置
2. 检查日志数据库是否有写入权限
3. 检查 Serilog 配置是否正确加载

### 问题：配置未生效

**检查点：**
1. 确认环境变量在应用启动前设置
2. 检查配置加载顺序（环境变量优先）
3. 查看应用启动日志，确认使用的数据库类型

## 数据库初始化

应用首次启动时会自动创建数据库和表结构：

- SQLite: 自动创建 `.db` 文件和表
- MySQL/MariaDB: 需要手动创建数据库，表结构自动创建

```sql
-- MySQL/MariaDB: 手动创建数据库
CREATE DATABASE IF NOT EXISTS mediahouse CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS mediahouse_logs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 迁移数据库

### SQLite → MySQL/MariaDB

1. 导出 SQLite 数据
2. 在 MySQL/MariaDB 中创建数据库
3. 修改配置使用 MySQL/MariaDB
4. 应用会自动创建表结构
5. 导入数据到新数据库

### MySQL → MariaDB

由于两者使用相同的协议和连接字符串格式，只需：
1. 修改 `MH_Database__Provider` 为 `MariaDB`
2. 确保连接字符串指向 MariaDB 服务器
3. 重启应用
