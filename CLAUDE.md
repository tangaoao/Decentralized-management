# 二次发放审批系统 — 项目开发指引

## 项目概述

三方协作的 Web 审批系统：**单位端**发起二次发放申请 → **银行端**审核（通过/退回）→ **财政端**全流程监管。

前后端分离架构：React + Ant Design + Node.js(Express) + SQLite + JWT 认证。

## 标准文件索引

所有开发相关的规范文件位于 `docs/` 目录，开发前请先阅读：

| 文件 | 说明 |
|------|------|
| [docs/requirements.md](docs/requirements.md) | 项目需求文档（完整版） |
| [docs/tech-stack.md](docs/tech-stack.md) | 技术选型与设计规范 |
| [docs/architecture.md](docs/architecture.md) | 项目架构设计 |
| [docs/api-design.md](docs/api-design.md) | API 接口设计文档 |
| [docs/database-design.md](docs/database-design.md) | 数据库设计文档 |
| [docs/implementation-plan.md](docs/implementation-plan.md) | 分步实现计划 |

## 工作约定

1. **开发日志**：每天在 `开发日志/YYYY-MM-DD.md` 记录当日完成事项和待办事项
2. **增量推进**：严格按照实现计划分步执行，每步完成后验证再进入下一步
3. **代码风格**：中文注释，模块化，RESTful API 风格
4. **安全第一**：JWT 认证、角色权限校验（前后端双重校验）、SQL 参数化查询
5. **可运行优先**：每步产出可验证的结果，不一次写太多代码

## 项目结构

```
Decentralized management/
├── CLAUDE.md                 # 本文件 — 项目开发总指引
├── docs/                     # 项目规范文档
├── 开发日志/                  # 每日开发日志
├── server/                   # 后端 (Express + SQLite)
│   └── src/
│       ├── index.js          # Express 入口
│       ├── db.js             # 数据库初始化 + 辅助函数
│       ├── middleware/        # auth.js + roleCheck.js
│       └── routes/            # auth.js + applications.js
└── client/                   # 前端 (React + Ant Design)
    └── src/
        ├── App.js            # 路由配置
        ├── api.js            # Axios + API 调用
        ├── auth/             # AuthContext + LoginPage
        ├── layouts/          # 三种角色的布局组件
        ├── pages/            # unit/ bank/ finance/ 页面
        └── components/       # 公共组件
```

## 快速启动

```bash
# 后端 (端口 5000)
cd server && npm start

# 前端 (端口 3000)
cd client && npm start
```

## 测试账号

| 用户名 | 密码 | 角色 | 单位/银行 | 部门 |
|--------|------|------|-----------|------|
| unit1 | unit1 | 单位端 | 施工单位A | — |
| unit2 | unit2 | 单位端 | 施工单位B | — |
| bank1 | bank1 | 银行端 | 中国农业银行 | — |
| bank2 | bank2 | 银行端 | 中国农商银行 | — |
| finance1 | finance1 | 财政端 | — | 信息中心 |
| finance2 | finance2 | 财政端 | — | 监督局 |
