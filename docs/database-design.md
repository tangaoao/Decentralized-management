# 数据库设计文档

## 数据库引擎

SQLite（通过 sql.js 纯 JS 实现，无需原生编译），WAL 模式。

## 用户表 `users`

用户数据持久化存储，支持财政端在线新增/删除。

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,       -- SHA-256 + salt 哈希
  role          TEXT NOT NULL CHECK(role IN ('UNIT','BANK','FINANCE')),
  display_name  TEXT NOT NULL,
  unit_name     TEXT,                -- 单位用户专用
  bank_name     TEXT,                -- 银行用户专用
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

## 申请表 `secondary_issue_application`

```sql
CREATE TABLE secondary_issue_application (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_no  TEXT NOT NULL UNIQUE,          -- 系统生成 SQ202606160001
  project_name    TEXT NOT NULL,                 -- 项目名称（≤100字符）
  issue_no        TEXT NOT NULL,                 -- 发放单号（格式 2026-411381-GLJT-91163218）
  assigned_bank   TEXT NOT NULL,                 -- 分配的银行用户名
  reason          TEXT,                          -- 申请理由（≤500字符）
  applicant       TEXT NOT NULL,                 -- 申请人账号
  unit_name       TEXT NOT NULL,                 -- 单位名称
  application_date TEXT NOT NULL,                -- 申请时间 YYYY-MM-DD HH:MM:SS
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK(status IN ('PENDING','ISSUED','RETURNED')),
  auditor         TEXT,                          -- 审核人（银行端账号）
  audit_date      TEXT,                          -- 审核时间
  audit_remark    TEXT,                          -- 审核备注（可选）
  returned_by     TEXT,                          -- 退回人（银行端账号）
  return_date     TEXT,                          -- 退回时间
  return_reason   TEXT,                          -- 退回原因（退回时必填）
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 索引
CREATE INDEX idx_issue_no       ON secondary_issue_application(issue_no);
CREATE INDEX idx_status         ON secondary_issue_application(status);
CREATE INDEX idx_applicant      ON secondary_issue_application(applicant);
CREATE INDEX idx_assigned_bank  ON secondary_issue_application(assigned_bank);
```

## 种子数据

### 用户数据（5 条）

| id | username | password | role | display_name | unit_name | bank_name |
|----|----------|----------|------|-------------|-----------|-----------|
| 1 | unit1 | unit1 | UNIT | 单位操作员A | 施工单位A | — |
| 2 | unit2 | unit2 | UNIT | 单位操作员B | 施工单位B | — |
| 3 | bank1 | bank1 | BANK | 银行审核员A | — | 中国农业银行 |
| 4 | bank2 | bank2 | BANK | 银行审核员B | — | 中国农商银行 |
| 5 | finance1 | finance1 | FINANCE | 财政管理员 | — | — |

### 申请数据（7 条）

| id | issue_no | assigned_bank | project_name | applicant | unit_name | status | 备注 |
|----|----------|---------------|-------------|-----------|-----------|--------|------|
| 1 | 2026-411381-GLJT-91163218 | bank1 | 市政道路维护工程 | unit1 | 施工单位A | PENDING | |
| 2 | 2026-411381-GLJT-91163218 | bank1 | 桥梁加固项目 | unit1 | 施工单位A | PENDING | |
| 3 | 2026-411381-GLJT-91163218 | bank1 | 河道治理工程 | unit1 | 施工单位A | ISSUED | auditor=bank1 |
| 4 | 2026-411381-XXGC-20260001 | bank1 | 学校扩建项目 | unit1 | 施工单位A | PENDING | |
| 5 | 2026-411381-XXGC-20260001 | bank1 | 医院改造工程 | unit1 | 施工单位A | RETURNED | return_reason 有值 |
| 6 | 2026-411381-WSCL-20260002 | bank2 | 污水处理项目 | unit2 | 施工单位B | PENDING | |
| 7 | 2026-411381-WSCL-20260002 | bank2 | 管网改造项目 | unit2 | 施工单位B | PENDING | |

设计意图：
- 2026-411381-GLJT-91163218 有 3 条 → 验证汇总分组
- 2026-411381-XXGC-20260001 有 2 条（含 1 条已退回）→ 验证退回流程
- 2026-411381-WSCL-20260002 有 2 条（unit2 → bank2）→ 验证多单位+多银行数据隔离

## 数据隔离规则

| 角色 | 可见范围 |
|------|----------|
| UNIT | 仅自己发起的申请（applicant = 自己） |
| BANK | 仅分配给自己的申请（assigned_bank = 自己） |
| FINANCE | 全量数据 |

## 数据库辅助函数

```javascript
queryAll(sql, params)     // 查询多行，返回对象数组
queryOne(sql, params)     // 查询单行，返回对象或 null
dbRun(sql, params)        // 执行写操作，自动 saveDb()
saveDb()                  // 手动持久化到磁盘
findUser(username)        // 按用户名查用户
findUserById(id)          // 按 ID 查用户
listUsers()               // 列出所有用户（不含密码哈希）
listUsersByRole(role)     // 按角色列出用户
createUser({...})         // 新增用户
deleteUser(id)            // 删除用户
```
