# 用户管理 API 文档

## Base URL
```
http://localhost:5000/api/user
```

## 认证
所有接口都需要在请求头中提供 JWT Token：
```
Authorization: Bearer {token}
```

---

## 1. 获取当前用户资料

### 请求
```http
GET /api/user/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 响应
```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.com",
  "isActive": true,
  "createTime": "2024-01-01T00:00:00Z",
  "updateTime": "2024-01-01T00:00:00Z"
}
```

### 错误响应
```json
{
  "error": "User not authenticated"
}
```

---

## 2. 更新当前用户资料

### 请求
```http
PUT /api/user/me
Authorization: Bearer {token}
Content-Type: application/json

{
  "email": "newemail@example.com",
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

### 响应
```json
{
  "id": 1,
  "username": "admin",
  "email": "newemail@example.com",
  "isActive": true,
  "createTime": "2024-01-01T00:00:00Z",
  "updateTime": "2024-01-02T10:30:00Z"
}
```

### 错误响应
```json
{
  "error": "Current password is incorrect"
}
```

---

## 3. 获取用户列表（分页）

### 请求
```http
GET /api/user?page=1&pageSize=10&username=adm&isActive=true
Authorization: Bearer {token}
```

### 查询参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| pageSize | int | 否 | 每页数量，默认 10 |
| username | string | 否 | 用户名模糊搜索 |
| email | string | 否 | 邮箱模糊搜索 |
| isActive | bool | 否 | 是否激活 |

### 响应
```json
{
  "data": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "isActive": true,
      "createTime": "2024-01-01T00:00:00Z",
      "updateTime": "2024-01-01T00:00:00Z"
    }
  ],
  "totalCount": 1,
  "page": 1,
  "pageSize": 10
}
```

---

## 4. 根据 ID 获取用户详情

### 请求
```http
GET /api/user/2
Authorization: Bearer {token}
```

### 响应
```json
{
  "id": 2,
  "username": "john",
  "email": "john@example.com",
  "isActive": true,
  "createTime": "2024-01-15T00:00:00Z",
  "updateTime": "2024-01-15T00:00:00Z"
}
```

### 错误响应
```json
{
  "error": "User not found"
}
```

---

## 5. 创建新用户

### 请求
```http
POST /api/user
Authorization: Bearer {token}
Content-Type: application/json

{
  "username": "alice",
  "password": "password123",
  "email": "alice@example.com"
}
```

### 请求体参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名，至少 3 个字符 |
| password | string | 是 | 密码，至少 6 个字符 |
| email | string | 否 | 邮箱地址 |

### 响应
```json
{
  "id": 3,
  "username": "alice",
  "email": "alice@example.com",
  "isActive": true,
  "createTime": "2024-04-11T10:00:00Z",
  "updateTime": "2024-04-11T10:00:00Z"
}
```

### 错误响应
```json
{
  "error": "Username already exists"
}
```

---

## 6. 更新指定用户

### 请求
```http
PUT /api/user/2
Authorization: Bearer {token}
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "isActive": false
}
```

### 请求体参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 否 | 新邮箱地址 |
| isActive | bool | 否 | 是否激活 |

### 响应
```json
{
  "id": 2,
  "username": "john",
  "email": "john.doe@example.com",
  "isActive": false,
  "createTime": "2024-01-15T00:00:00Z",
  "updateTime": "2024-04-11T11:00:00Z"
}
```

---

## 7. 删除指定用户

### 请求
```http
DELETE /api/user/3
Authorization: Bearer {token}
```

### 响应
```json
{
  "message": "User deleted successfully"
}
```

### 错误响应
```json
{
  "error": "Cannot delete your own account. Use DELETE /api/user/me instead."
}
```

---

## 8. 修改用户密码

### 8.1 修改自己的密码

### 请求
```http
PUT /api/user/1/password
Authorization: Bearer {token}
Content-Type: application/json

{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

### 8.2 管理员修改其他用户密码

### 请求
```http
PUT /api/user/2/password
Authorization: Bearer {token}
Content-Type: application/json

{
  "newPassword": "newpassword789"
}
```

### 请求体参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| currentPassword | string | 条件必填 | 修改自己密码时必填 |
| newPassword | string | 是 | 新密码，至少 6 个字符 |

### 响应
```json
{
  "message": "Password changed successfully"
}
```

### 错误响应
```json
{
  "error": "Current password is incorrect"
}
```

---

## 9. 删除当前用户账号

### 请求
```http
DELETE /api/user/me
Authorization: Bearer {token}
Content-Type: application/json

{
  "password": "password123"
}
```

### 请求体参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| password | string | 是 | 当前密码，用于确认 |

### 响应
```json
{
  "message": "Account deleted successfully"
}
```

### 错误响应
```json
{
  "error": "Incorrect password"
}
```

---

## 通用错误响应

### 401 Unauthorized
```json
{
  "error": "User not authenticated"
}
```

### 404 Not Found
```json
{
  "error": "User not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to process request"
}
```

---

## 注意事项

1. 所有接口都需要通过 JWT 认证
2. 当前项目没有角色/权限系统，任何登录用户都可以操作所有接口
3. 生产环境应该添加管理员权限检查
4. 删除用户会级联删除关联的 `MyFavor` 和 `PlayRecord` 数据
5. 密码会自动进行 PBKDF2-SHA256 哈希处理，不会明文存储
