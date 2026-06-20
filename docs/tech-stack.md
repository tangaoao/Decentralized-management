# 技术选型与设计规范

## 技术栈

| 层 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 前端框架 | React | 18.x | 函数组件 + Hooks |
| UI 组件库 | Ant Design | 5.x | 企业级组件，Table/Form/Modal/Tabs/Tag |
| 路由 | React Router | 6.x | useNavigate, useParams, Routes/Route |
| HTTP 客户端 | Axios | 1.x | 拦截器统一处理 JWT |
| 后端框架 | Express | 4.x | RESTful API |
| 数据库 | SQLite (sql.js) | 1.x | 纯 JS 实现，无需原生编译 |
| 认证 | JWT (jsonwebtoken) | 9.x | 24h 过期，Bearer Token |
| 密码哈希 | crypto (Node 内置) | — | SHA-256 + salt |
| 实时同步 | 轮询 | — | 前端每 5 秒 GET 刷新 |

## 设计规范

### 命名规范

| 项 | 规范 | 示例 |
|---|---|---|
| 文件名 | PascalCase（组件）/ camelCase（工具） | `UnitDashboard.js` / `api.js` |
| 数据库表名 | snake_case | `secondary_issue_application` |
| 数据库字段 | snake_case | `application_no` |
| API 路径 | kebab-case / camelCase | `/api/applications/by-issue/:no` |
| 函数名 | camelCase | `fetchData`, `handleAudit` |
| 常量 | UPPER_SNAKE | `JWT_SECRET`, `STATUS_MAP` |

### 代码风格
- 中文注释说明业务逻辑
- 每个文件单一职责
- API 遵循 RESTful 风格
- 前端组件按功能分目录（auth / layouts / pages / components）

### 安全规范
- 所有 API（除 login）均需 JWT 认证
- 角色操作在后端再次校验（前端路由守卫 + 后端中间件双重保障）
- SQL 使用参数化查询，防止注入
- 密码使用 SHA-256 + salt 哈希存储

### 用户管理
- 用户数据持久化到 SQLite users 表
- 密码使用 SHA-256 + salt 哈希存储
- 财政端可在线新增/删除用户
- 角色分为 UNIT（单位）/ BANK（银行）/ FINANCE（财政）

### 时间格式
- 统一 `YYYY-MM-DD HH:MM:SS`
- SQLite 使用 `datetime('now','localtime')`
