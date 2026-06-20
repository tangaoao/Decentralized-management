# 分步实现计划

## 第 0 步：脚手架 ✅
- [x] 创建 `server/package.json` + 安装依赖（express, cors, sql.js, jsonwebtoken）
- [x] 创建 `client/package.json` + 安装依赖（react, antd, axios, react-router-dom）
- [x] 创建项目目录结构

## 第 1 步：后端核心
- [ ] `server/src/db.js` — 数据库初始化 + 建表 + 种子数据 + 辅助函数
- [ ] `server/src/middleware/auth.js` — JWT 验证中间件
- [ ] `server/src/middleware/roleCheck.js` — 角色权限守卫
- [ ] `server/src/routes/auth.js` — POST /login, GET /me
- [ ] `server/src/routes/applications.js` — 7 个业务接口
- [ ] `server/src/index.js` — Express 组装，端口 5000

## 第 2 步：前端认证外壳
- [ ] `client/src/api.js` — Axios + 拦截器 + API 函数
- [ ] `client/src/auth/AuthContext.js` — 认证上下文
- [ ] `client/src/auth/LoginPage.js` — 登录页
- [ ] `client/src/layouts/ProtectedRoute.js` — 路由守卫
- [ ] `client/src/App.js` — 路由配置
- [ ] `client/src/index.js` — ReactDOM 入口

## 第 3 步：单位端
- [ ] `client/src/layouts/UnitLayout.js` — 布局
- [ ] `client/src/pages/unit/UnitDashboard.js` — 新增申请 + 列表
- [ ] `client/src/pages/unit/EditApplication.js` — 修改退回申请

## 第 4 步：银行端
- [ ] `client/src/layouts/BankLayout.js` — 布局
- [ ] `client/src/pages/bank/AuditModal.js` — 审核弹窗
- [ ] `client/src/pages/bank/BankDashboard.js` — Tabs + 列表

## 第 5 步：财政端
- [ ] `client/src/layouts/FinanceLayout.js` — 布局
- [ ] `client/src/pages/finance/SummaryReport.js` — 汇总卡片
- [ ] `client/src/pages/finance/IssueDetail.js` — 穿透明细
- [ ] `client/src/pages/finance/FinanceDashboard.js` — 汇总 + 列表

## 第 6 步：公共组件 & 收尾
- [ ] `client/src/components/StatusTag.js` — 状态标签
- [ ] `client/src/App.css` — 全局样式
- [ ] `README.md` — 启动说明
