# GitHub 同步与自动部署配置指南

## 概述

本文档记录项目接入 GitHub 仓库并配置服务器自动拉取部署的完整流程，方便后续复盘和同类项目复用。

**仓库地址**：`https://github.com/tangaoao/Decentralized-management.git`  
**服务器 IP**：`39.96.18.98`（Alibaba Cloud Linux 3 + 宝塔面板）

---

## 一、本地仓库初始化并推送

### 1. 创建 .gitignore

排除不需要版本控制的大文件和环境文件：

```
node_modules/
*.7z
*.xlsx
.env
```

### 2. 首次提交并推送

```bash
cd /path/to/project
git init
git add .
git commit -m "初始提交：二次发放审批系统项目搭建"
git remote add origin https://github.com/tangaoao/Decentralized-management.git
git push -u origin main
```

> **踩坑**：`git push` 报 `src refspec main does not match any` — 因为仓库还没有任何 commit，先 `git commit` 再 push 即可。

---

## 二、服务器安装 Git

服务器默认没有 git，需要先安装（Alibaba Cloud Linux 3 基于 RHEL/CentOS）：

```bash
dnf install -y git
# 或者 yum install -y git

git --version  # 验证
```

---

## 三、服务器项目目录接入 Git

项目之前是直接上传的文件，需要转换为 Git 仓库以支持 `git pull` 拉取更新。

### 步骤

```bash
# 1. 备份环境文件和数据库（防止被远程代码覆盖）
cp /www/wwwroot/approval/server/.env /tmp/approval-env-backup

# 2. 初始化并关联远程仓库
cd /www/wwwroot/approval
git init
git remote add origin https://github.com/tangaoao/Decentralized-management.git
git fetch origin

# 3. 切换到远端 main 分支（覆盖本地文件以匹配仓库）
git checkout -t origin/main

# 4. 还原被保护文件
cp /tmp/approval-env-backup server/.env

# 5. 重新构建前端
cd /www/wwwroot/approval/client
npm run build

# 6. 重启后端
pm2 restart approval-server
```

### .gitignore 已排除的保护项

| 文件/目录 | 说明 |
|-----------|------|
| `server/.env` | JWT_SECRET 等敏感配置，不会被 git pull 覆盖 |
| `server/data/app.db` | SQLite 数据库，线上业务数据不会丢失 |
| `node_modules/` | 依赖包，各自 install |

---

## 四、宝塔面板配置 WebHook 自动部署

### 架构

```
GitHub push → Webhook 通知 → 宝塔服务器(:8888) → 执行部署脚本
                                                    ├── git pull
                                                    ├── npm run build
                                                    └── pm2 restart
```

### 1. 安装 WebHook 插件

宝塔面板 → 软件商店 → 搜索 **"WebHook"** → 安装 → 点击设置。

### 2. 添加钩子脚本

| 参数 | 填写内容 |
|------|----------|
| 名称 | `自动拉取GitHub代码` |
| 脚本 | 见下方 ↓ |
| 备注 | 监听 GitHub push 事件，自动 git pull + 构建 + 重启 |

**脚本内容**：

```bash
#!/bin/bash
echo ""
echo "========== $(date '+%Y-%m-%d %H:%M:%S') =========="
cd /www/wwwroot/approval

echo ">>> git pull..."
git pull origin main

echo ">>> 重新构建前端..."
cd /www/wwwroot/approval/client
npm run build

echo ">>> 重启后端..."
pm2 restart approval-server

echo ">>> 部署完成！"
```

保存后点击 **查看密钥**，复制 WebHook URL：
`http://39.96.18.98:8888/hook?access_key=xxxxx`

### 3. GitHub 配置 Webhook

打开仓库 → Settings → Webhooks → Add webhook：

| 字段 | 值 |
|------|-----|
| Payload URL | 宝塔复制的 WebHook URL |
| Content type | `application/json` |
| Secret | 留空 |
| Events | **Just the push event** |

添加后 GitHub 会自动发送一条 ping 验证连通性。

### 4. 验证方式

- **方式一**：本地 push 一次，到宝塔 WebHook 日志查看是否触发
- **方式二**：浏览器直接访问 WebHook URL 手动触发
- **方式三**：SSH 查看 PM2 日志 `pm2 logs approval-server`

---

## 五、日常开发→部署工作流

```
本地开发 → git commit → git push
                              ↓
                    GitHub Webhook 自动触发
                              ↓
                    服务器 git pull + 构建 + 重启
                              ↓
                    http://39.96.18.98 更新完成
```

**手动更新命令（备用）**：

```bash
cd /www/wwwroot/approval
git pull origin main
cd client && npm run build
pm2 restart approval-server
```

---

## 六、踩坑记录

| # | 现象 | 原因 | 解决 |
|---|------|------|------|
| 1 | `git push` 报 `src refspec main does not match any` | 仓库无 commit，main 分支尚不存在 | 先 `git commit` 创建首次提交 |
| 2 | 服务器未安装 git | Alibaba Cloud Linux 3 最小安装 | `dnf install -y git` |
| 3 | GitHub 国内拉取慢/超时 | 网络问题 | 配置镜像：`git config --global url."https://ghproxy.com/https://github.com".insteadOf https://github.com` |

---

## 七、关键信息速查

| 项目 | 信息 |
|------|------|
| GitHub 仓库 | https://github.com/tangaoao/Decentralized-management |
| 服务器 IP | 39.96.18.98 |
| 项目路径 | /www/wwwroot/approval/ |
| 宝塔面板口 | 8888 |
| 后端端口 | 5000（仅本机，Nginx 代理后走 80） |
| WebHook 插件 | 宝塔软件商店 → WebHook |
| PM2 进程名 | approval-server |

---

## 八、相关文档

- [部署指南](deployment-guide.md) — 初次部署完整流程
- [API 设计](api-design.md)
- [数据库设计](database-design.md)
