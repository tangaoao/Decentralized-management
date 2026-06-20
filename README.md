# 二次发放审批系统

三方协作 Web 审批系统：**单位端**发起二次发放申请 → **银行端**审核（通过/退回）→ **财政端**全流程监管。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Ant Design 5 + React Router 6 + Axios |
| 后端 | Node.js + Express |
| 数据库 | SQLite（sql.js 纯 JS 实现） |
| 认证 | JWT（SHA-256 密码哈希） |

## 快速启动

### 1. 安装依赖

```bash
cd server && npm install
cd ../client && npm install
```

### 2. 启动后端（端口 5000）

```bash
cd server
npm start
```

### 3. 启动前端（端口 3000）

```bash
cd client
npm start
```

浏览器打开 `http://localhost:3000`

## 测试账号

| 用户名 | 密码 | 角色 | 可见数据 |
|--------|------|------|----------|
| unit1 | unit1 | 单位端（施工单位A） | 仅自己的 5 条申请 |
| unit2 | unit2 | 单位端（施工单位B） | 仅自己的 2 条申请 |
| bank1 | bank1 | 银行端 | 所有待审核 / 已发放申请 |
| finance1 | finance1 | 财政端 | 全部申请 + 汇总报表 |

## 项目文档

详细文档见 `docs/` 目录：
- [需求文档](docs/requirements.md)
- [技术选型](docs/tech-stack.md)
- [架构设计](docs/architecture.md)
- [API 设计](docs/api-design.md)
- [数据库设计](docs/database-design.md)
- [实现计划](docs/implementation-plan.md)

## 状态流转

```
PENDING（待审核）──通过──→ ISSUED（已发放）
       │
       └──退回──→ RETURNED（已退回）──单位修改重提──→ PENDING
```
