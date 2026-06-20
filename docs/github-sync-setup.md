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
cp /www/wwwroot/approval/server/data/app.db /tmp/app.db.backup

# 2. 初始化并关联远程仓库
cd /www/wwwroot/approval
git init
git remote add origin https://github.com/tangaoao/Decentralized-management.git
git fetch origin

# 3. 删除本地文件（它们会挡住 checkout）
rm -rf .claude CLAUDE.md README.md client deploy docs server start.ps1 start.sh 开发日志 deploy.sh

# 4. 切换到远端 main 分支（覆盖本地文件以匹配仓库）
git checkout -t origin/main

# 5. 还原被保护文件
cp /tmp/approval-env-backup server/.env
cp /tmp/app.db.backup server/data/app.db

# 6. 安装依赖 + 构建前端
cd /www/wwwroot/approval/client
npm install
npm run build

# 7. 统一文件归属（避免 WebHook 执行时报 ownership 错误）
chown -R www:www /www/wwwroot/approval

# 8. 重启后端
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
                                                    ├── git fetch + reset --hard
                                                    ├── npm install（server + client）
                                                    ├── npm run build
                                                    └── pm2 restart
```

### 1. 安装 WebHook 插件

宝塔面板 → 软件商店 → 搜索 **"WebHook"** → 安装 → 点击设置。

### 2. 添加钩子脚本

| 参数 | 填写内容 |
|------|----------|
| 名称 | `github-deploy` |
| 脚本 | 见下方 ↓ |
| 备注 | 监听 GitHub push 事件，自动 git pull + 构建 + 重启 |

**脚本内容（最终优化版）**：

```bash
#!/bin/bash
echo ""
echo "========== $(date '+%Y-%m-%d %H:%M:%S') =========="

# 兜底：允许所有目录（解决 WebHook www 用户 ownership 报错）
git config --global --add safe.directory '*' 2>/dev/null

cd /www/wwwroot/approval || { echo ">>> 目录不存在！"; exit 1; }

BEFORE=$(git rev-parse --short HEAD 2>/dev/null || echo "none")
echo ">>> 更新前版本: $BEFORE"

# 用 fetch + reset --hard 替代 git pull，避免本地冲突导致拉取失败
echo ">>> 拉取最新代码..."
git fetch origin main 2>&1 || { echo ">>> git fetch 失败，请检查网络"; exit 1; }
git reset --hard origin/main 2>&1 || { echo ">>> git reset 失败"; exit 1; }

AFTER=$(git rev-parse --short HEAD)
echo ">>> 更新后版本: $AFTER"

if [ "$BEFORE" = "$AFTER" ]; then
    echo ">>> 代码已是最新，跳过部署"
    exit 0
fi

echo ">>> 安装/更新后端依赖..."
cd /www/wwwroot/approval/server || exit 1
npm install 2>&1

echo ">>> 安装/更新前端依赖..."
cd /www/wwwroot/approval/client || exit 1
npm install 2>&1

echo ">>> 重新构建前端..."
npm run build 2>&1

echo ">>> 重启后端..."
pm2 restart approval-server 2>&1

echo ">>> 部署完成！版本: $AFTER"
```

保存后点击 **查看密钥**，复制 WebHook URL：
`http://39.96.18.98:8888/hook?access_key=xxxxx`

### 3. GitHub 配置 Webhook

打开仓库 → Settings → Webhooks → Add webhook：

| 字段 | 值 |
|------|-----|
| Payload URL | 宝塔复制的 WebHook URL（**必须带 `access_key=`**） |
| Content type | `application/json` |
| Secret | 留空 |
| Events | **Just the push event** |

> **踩坑**：宝塔生成的 URL 参数是 `?xxxx`（没有 `access_key=` 前缀），直接填到 GitHub 会 404。必须手动补上 `?access_key=xxxx`。

### 4. 验证方式

- **方式一**：本地 push 一次，到宝塔 WebHook 日志查看是否触发
- **方式二**：浏览器直接访问 WebHook URL 手动触发
- **方式三**：GitHub → Settings → Webhooks → Recent Deliveries → Redeliver 重放

---

## 五、日常开发→部署工作流

```
本地开发 → git commit → git push
                              ↓
                    GitHub Webhook 自动触发
                              ↓
                    服务器 fetch + reset + 构建 + 重启
                              ↓
                    http://39.96.18.98 更新完成
```

**手动更新命令（备用）**：

```bash
cd /www/wwwroot/approval
git fetch origin main
git reset --hard origin/main
cd client && npm install && npm run build
pm2 restart approval-server
```

---

## 六、踩坑记录

| # | 现象 | 原因 | 解决 |
|---|------|------|------|
| 1 | `git push` 报 `src refspec main does not match any` | 仓库无 commit，main 分支尚不存在 | 先 `git commit` 创建首次提交 |
| 2 | 服务器未安装 git | Alibaba Cloud Linux 3 最小安装 | `dnf install -y git` |
| 3 | GitHub 国内拉取慢/超时 — 服务器端 | DNS 解析到不可达 IP | 修改 `/etc/hosts` 绑定可达 IP（见第七节） |
| 4 | GitHub 国内拉取慢 — 本地端 | 同样 DNS 问题 + node_modules 扫描慢 | 修改 hosts + 启用 `core.untrackedCache`、`core.fsmonitor`（见第八节） |
| 5 | `git pull` 报 `Empty reply from server` | 服务器出方向 443 不通 GitHub | hosts 绑 IP；如仍不通检查阿里云安全组出方向规则 |
| 6 | WebHook 返回 404 | URL 缺少 `access_key=` 前缀 | 补上 `?access_key=xxx` |
| 7 | `git checkout -t origin/main` 报文件冲突 | 服务器原有文件挡住 checkout | 删掉文件后再 checkout，`.gitignore` 保护的文件提前备份 |
| 8 | `npm run build` 报 `.user.ini` 错误 | 宝塔自动生成的保护文件 | `chattr -i xxx` 去掉属性后删除 |
| 9 | 后端启动报 `MODULE_NOT_FOUND dotenv` | `git reset --hard` 清掉了旧 `node_modules`，新依赖未安装 | WebHook 脚本必须加 `npm install` |
| 10 | git pull 报 `dubious ownership` | WebHook 以 `www` 用户执行，但目录属主是 `root` | `chown -R www:www /www/wwwroot/approval` + 创建 `/etc/gitconfig` 设 `safe.directory = *` |
| 11 | 本地 git push 报 `Connection refused 127.0.0.1:7890` | 全局代理配了但代理未启动 | `git config --global --unset http.proxy` 移除失效代理 |
| 12 | git pull 报 `Empty last update token` | Git for Windows 后台更新检查在国内超时 | `git config --global maintenance.auto false` |
| 13 | WebHook 日志只有空行 | `set -e` 导致遇错静默退出 | 删掉 `set -e`，关键步骤加 `\|\| { echo "xxx"; exit 1; }` |
| 14 | ghproxy.com / mirror.ghproxy.com / gitclone.com 全部超时 | 这些镜像也已不可用 | 不用镜像，改用 hosts 绑定 IP |

---

## 七、服务器 GitHub 加速 — hosts 配置

### 为什么

阿里云国内服务器 DNS 解析 `github.com` 可能得到不可达的 IP，导致 `git fetch` 超时。不走镜像（镜像都不稳定），直接在 hosts 绑定可达 IP。

### 操作

```bash
# 1. 测试哪个 IP 通
ping -c 2 140.82.114.4
ping -c 2 140.82.112.26
ping -c 2 20.27.177.113

# 2. 选延迟最低的，写入 hosts
echo "140.82.114.4  github.com" >> /etc/hosts

# 3. 验证
ping -c 2 github.com
curl -I https://github.com --connect-timeout 10
```

### Github 常用 IP 备选

| IP | 备注 |
|----|------|
| `140.82.114.4` | 官方主 IP，国内多数地区可通 |
| `140.82.112.26` | 备选 |
| `20.27.177.113` | 日本东京微软云，部分地区更快 |

### 系统级 Git 配置（解决 ownership 报错）

```bash
echo '[safe]' > /etc/gitconfig
echo '	directory = *' >> /etc/gitconfig
```

## 八、本地 Git 加速 — 三步优化

### 问题根源

1. **commit 慢**：`node_modules` 6 万+ 文件，虽然 gitignore 了但 `git status` 仍要遍历
2. **push 慢**：DNS 解析到不可达 IP + 过期代理配置拖慢连接
3. **warning 刷屏**：Git for Windows 后台更新检查连不上 GitHub

### 一步到位

```powershell
# 1. commit 加速 — 让 git 不再扫描 node_modules
git config core.untrackedCache true
git update-index --untracked-cache
git config core.fsmonitor true

# 2. push 加速 — hosts 绑定可达 IP
#   以管理员打开 PowerShell：
$ip = "140.82.114.4"  # 先 ping 测一下选最快的
$hosts = "$env:windir\System32\drivers\etc\hosts"
$content = Get-Content $hosts | Where-Object { $_ -notmatch "github\.com" }
$content + "" + "$ip  github.com" | Set-Content $hosts -Encoding UTF8
ipconfig /flushdns

# 3. 关闭 Git 自动更新检查 + 清理失效代理
git config --global maintenance.auto false
git config --global --unset http.proxy 2>$null
git config --global --unset https.proxy 2>$null
```

### 验证

```powershell
ping github.com -n 2    # 延迟应 < 150ms
git status               # 应该秒出结果
git push                 # 应该秒推
```

---

## 九、关键信息速查

| 项目 | 信息 |
|------|------|
| GitHub 仓库 | https://github.com/tangaoao/Decentralized-management |
| 服务器 IP | 39.96.18.98 |
| 项目路径 | /www/wwwroot/approval/ |
| 宝塔面板端口 | 8888 |
| 后端端口 | 5000（仅本机，Nginx 代理后走 80） |
| WebHook 插件 | 宝塔软件商店 → WebHook |
| PM2 进程名 | approval-server |
| 宝塔执行用户 | `www`（非 root） |
| Git 系统配置 | `/etc/gitconfig` |

---

## 十、相关文档

- [部署指南](deployment-guide.md) — 初次部署完整流程
- [API 设计](api-design.md)
- [数据库设计](database-design.md)
