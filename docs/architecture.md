# 项目架构设计

## 整体架构

```
┌─────────────────────────────────────────────────┐
│                    浏览器                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 单位端    │ │ 银行端    │ │ 财政端    │         │
│  │ /unit    │ │ /bank    │ │ /finance │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘         │
│       └────────────┼────────────┘               │
│                    │ Axios + JWT                 │
│                    │ 5秒轮询                     │
└────────────────────┼────────────────────────────┘
                     │
              ┌──────┴──────┐
              │  Express    │  :5000
              │  CORS       │
              │  JWT 中间件  │
              │  角色守卫    │
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │  SQLite     │
              │  (sql.js)   │
              │  WAL 模式   │
              └─────────────┘
```

## 前端路由

```
/login              → LoginPage
/unit               → UnitLayout > UnitDashboard
/unit/edit/:id      → UnitLayout > EditApplication
/bank               → BankLayout > BankDashboard (Tabs)
/finance            → FinanceLayout > FinanceDashboard
/finance/issue/:no  → FinanceLayout > IssueDetail
/                   → 重定向 /login
```

## 后端路由

```
POST /api/auth/login              # 登录
GET  /api/auth/me                 # 当前用户
GET  /api/applications            # 申请列表（角色过滤）
POST /api/applications            # 创建申请（UNIT）
PUT  /api/applications/:id/audit   # 审核通过（BANK）
PUT  /api/applications/:id/return  # 退回申请（BANK）
PUT  /api/applications/:id/resubmit # 重提申请（UNIT）
GET  /api/applications/summary    # 汇总报表（FINANCE）
GET  /api/applications/by-issue/:no # 穿透明细（FINANCE）
```

## 认证流程

1. 用户登录 → POST /api/auth/login → 服务端验证用户名密码 → 返回 JWT
2. 前端存储 token 到 localStorage
3. 后续请求 Axios 拦截器自动附加 `Authorization: Bearer <token>`
4. 服务端 auth.js 中间件验证 JWT → req.user = decoded
5. roleCheck.js 中间件校验角色权限
6. 401 → 前端自动跳转 /login
7. 403 → 权限不足

## 数据过滤规则

| 角色 | 过滤逻辑 |
|------|----------|
| UNIT | WHERE applicant = current_user（仅看自己） |
| BANK | 默认全部（前端 Tab 切换 status 参数） |
| FINANCE | 无过滤（看全部单位全部状态） |
