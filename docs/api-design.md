# API 接口设计文档

所有接口前缀 `/api`。Base URL: `http://localhost:5000`

## 认证接口

### POST /api/auth/login
```json
// Request
{ "username": "unit1", "password": "unit1" }

// Response 200
{ "token": "eyJ...", "user": { "id": 1, "username": "unit1", "role": "UNIT", "display_name": "单位操作员A", "unit_name": "施工单位A" } }

// Response 401
{ "error": "用户名或密码错误" }
```

### GET /api/auth/me
需要 Authorization header。返回当前用户信息。

## 业务接口

### GET /api/applications
- **角色**：ALL（UNIT 看自己 / BANK 看分配给自己的 / FINANCE 全量）
- **参数**：`?status=PENDING`（可选筛选）
- **响应**：`{ "data": [...], "total": N }`
- 每条记录附带 `bank_name` 字段（通过 LEFT JOIN users 获取）

### POST /api/applications
- **角色**：UNIT 专属
- **请求体**：
```json
{
  "project_name": "市政道路工程",
  "issue_no": "2026-411381-GLJT-91163218",
  "assigned_bank": "bank1",
  "reason": "进度款支付",
  "unit_name": "施工单位A"
}
```
- **响应 201**：创建的完整申请记录（含自动生成的 application_no、application_date、status=PENDING、bank_name）

### PUT /api/applications/:id/audit
- **角色**：BANK 专属
- **约束**：仅 PENDING 状态 + assigned_bank = 自己的申请可操作
- **请求体**：
```json
{ "audit_remark": "审核备注（可选）" }
```
- **响应 200**：更新后的记录（status=ISSUED, auditor, audit_date）

### PUT /api/applications/:id/return
- **角色**：BANK 专属
- **约束**：仅 PENDING 状态 + assigned_bank = 自己的申请可操作
- **请求体**：
```json
{ "return_reason": "退回原因（必填）" }
```
- **响应 400**：缺少 return_reason 参数
- **响应 403**：无权操作其他银行的申请
- **响应 200**：更新后的记录（status=RETURNED, returned_by, return_date, return_reason）

### PUT /api/applications/:id/resubmit
- **角色**：UNIT 专属
- **约束**：仅 RETURNED 状态 + 只能修改自己的申请
- **请求体**：
```json
{
  "project_name": "修改后的项目名称",
  "issue_no": "2026-411381-GLJT-91163218",
  "assigned_bank": "bank2",
  "reason": "修改后的理由"
}
```
- **响应 200**：更新后的记录（status=PENDING, returned_by/return_date/return_reason 清空）

### GET /api/applications/summary
- **角色**：FINANCE 专属
- **响应**：
```json
{
  "data": [
    {
      "issue_no": "2026-411381-GLJT-91163218",
      "project_names": "市政道路维护工程,桥梁加固项目,河道治理工程",
      "count": 3,
      "pending_count": 2,
      "issued_count": 1,
      "returned_count": 0
    }
  ]
}
```

### GET /api/applications/by-issue/:issueNo
- **角色**：FINANCE 专属
- **响应**：`{ "data": [...], "issue_no": "2026-411381-GLJT-91163218", "total": 3 }`
- 每条记录附带 `bank_name` 字段

## 用户管理接口

### GET /api/users/banks
- **角色**：所有已认证用户
- **响应**：`{ "data": [{ "username": "bank1", "bank_name": "中国农业银行" }, ...] }`

### GET /api/users
- **角色**：FINANCE 专属
- **响应**：`{ "data": [{ "id": 1, "username": "unit1", "role": "UNIT", "display_name": "单位操作员A", "unit_name": "施工单位A", "bank_name": null, "created_at": "..." }, ...] }`

### POST /api/users
- **角色**：FINANCE 专属
- **请求体**：
```json
{
  "username": "bank3",
  "password": "bank3",
  "role": "BANK",
  "display_name": "银行审核员C",
  "bank_name": "中国建设银行"
}
```
- **响应 201**：创建的用户信息（不含密码哈希）
- **响应 400**：用户名已存在 / 参数校验失败

### PUT /api/users/:id
- **角色**：FINANCE 专属
- **说明**：修改用户信息（显示名称、单位名称或银行名称），按角色只更新对应字段
- **请求体**：
```json
// UNIT 用户 — 修改显示名称 + 单位名称
{
  "display_name": "单位操作员A-修改",
  "unit_name": "施工单位A-变更"
}

// BANK 用户 — 修改显示名称 + 银行名称
{
  "display_name": "银行审核员A-修改",
  "bank_name": "中国农业银行XX支行"
}

// FINANCE 用户 — 仅修改显示名称
{
  "display_name": "财政管理员-修改"
}
```
- **响应 200**：`{ "message": "用户信息已更新" }`
- **响应 400**：未提供任何字段时返回 `{ "error": "至少需要提供显示名称、单位名称或银行名称之一" }`
- **响应 404**：用户不存在

### PUT /api/users/:id/reset-password
- **角色**：FINANCE 专属
- **说明**：将指定用户的密码重置为 `123456`
- **请求体**：无
- **响应 200**：`{ "message": "密码已重置为 123456" }`
- **响应 404**：用户不存在

### DELETE /api/users/:id
- **角色**：FINANCE 专属
- **约束**：不能删除自己
- **响应 200**：`{ "message": "用户已删除" }`

## 错误码规范

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 / 状态不允许操作 / 不能删除自己 |
| 401 | 未认证（token 缺失或无效） |
| 403 | 无权限（角色不匹配 / 无权操作其他银行申请） |
| 404 | 资源不存在 |
