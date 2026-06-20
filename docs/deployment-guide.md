# 二次发放审批系统 — 宝塔面板部署指南

## 一、环境信息

| 项目 | 详情 |
|------|------|
| 操作系统 | Alibaba Cloud Linux 3.2104 LTS |
| 服务器 IP | 39.96.18.98 |
| 面板 | 宝塔面板 |
| Node.js | v16.9.0（PM2 管理器自带） |
| Nginx | 1.28.3 |
| 项目路径 | /www/wwwroot/approval/ |

---

## 二、部署架构

```
浏览器 → Nginx(:80)
           ├── /api/*  →  proxy_pass → Node.js(:5000) Express 后端
           └── 其他    →  serve 静态文件 → client/build/ (React 前端)
```

只有 **Nginx + Node.js** 两个核心进程，不需要 MySQL/PHP/phpMyAdmin。

---

## 三、部署步骤

### 1. 上传项目

宝塔面板 → 文件 → `/www/wwwroot/` → 新建 `approval` 目录 → 上传整个项目。

> 确保 `/www/wwwroot/approval/server/.env` 文件存在且配置了 `JWT_SECRET`。

### 2. 构建前端

SSH 终端：

```bash
cd /www/wwwroot/approval/client
npm install
npm run build
```

> 构建产物生成在 `client/build/` 目录。

### 3. 配置 Nginx

配置文件路径：**`/www/server/panel/vhost/nginx/39.96.18.98.conf`**

```nginx
server {
    listen 80;
    server_name 39.96.18.98;
    index index.html;
    root /www/wwwroot/approval/client/build;

    include /www/server/panel/vhost/nginx/well-known/39.96.18.98.conf;
    include /www/server/panel/vhost/nginx/extension/39.96.18.98/*.conf;

    # 前端 SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    # 禁止访问的敏感文件
    location ~* (\.user.ini|\.htaccess|\.env.*|\.git|package(-lock)?\.json) {
        return 404;
    }
}
```

保存后验证并重载：

```bash
nginx -t && nginx -s reload
```

### 4. 启动后端（PM2）

宝塔 → 软件商店 → PM2 管理器 → 项目管理 → 添加项目：

| 字段 | 值 |
|------|-----|
| 启动文件 | `/www/wwwroot/approval/server/src/index.js` |
| 运行目录 | `/www/wwwroot/approval/server` |
| 项目名称 | `approval-server` |
| Node 版本 | v16.9.0 |

### 5. 验证部署

```bash
# 后端直接访问
curl http://127.0.0.1:5000/api/health
# → {"status":"ok","time":"..."}

# Nginx 代理访问
curl -H "Host: 39.96.18.98" http://127.0.0.1/api/health
# → {"status":"ok","time":"..."}
```

浏览器访问 `http://39.96.18.98` → 看到登录页 → 用 `unit1/unit1` 测试登录。

---

## 四、踩坑与解决

### 坑 1：前端 API 地址硬编码 localhost

**现象**：部署后在浏览器登录失败，请求发到了用户本机的 `localhost:5000`。

**原因**：`client/src/api.js` 第 7 行 `baseURL: 'http://localhost:5000/api'`。

**解决**：改为相对路径 `baseURL: '/api'`，让请求走 Nginx 反向代理。

### 坑 2：宝塔目录下 `.user.ini` 导致构建失败

**现象**：`npm run build` 报错 `ENOTDIR: not a directory, scandir 'build/.user.ini'`。

**原因**：宝塔会自动在每个目录下放 `.user.ini`，旧的 build 目录里这个文件有保护属性。

**解决**：

```bash
chattr -i /www/wwwroot/approval/client/build/.user.ini
rm -rf build
npm run build
```

### 坑 3：Nginx 配置冲突（duplicate location "/"）

**现象**：在宝塔面板保存 Nginx 配置报错 `duplicate location "/"`。

**原因**：宝塔自动生成的 PHP 配置和手动添加的 SPA 路由冲突。

**解决**：直接 SSH 用 `cat >` 命令覆盖整个配置文件，去掉 PHP 相关引用（`enable-php-00.conf`、rewrite 等）。

### 坑 4：curl 测试 Nginx 代理返回 404

**现象**：`curl http://127.0.0.1/api/health` 返回 Nginx 404。

**原因**：`curl` 不带 Host 头访问 `127.0.0.1` 时匹配的是 Nginx 默认站点，不是你的站点配置。

**解决**：用 `curl -H "Host: 39.96.18.98" http://127.0.0.1/api/health` 指定 Host 头测试。事实上浏览器访问域名时已经带 Host 头，所以浏览器能正常用。

### 坑 5：PM2 管理器的 PATH 问题

**现象**：宝塔 PM2 管理器添加项目失败，`pm2: command not found`。

**原因**：宝塔 PM2 管理器 GUI 内部 shell 环境有 bug，找不到自己的 pm2 命令。

**解决**：尝试用 GUI 添加，如果失败就用 SSH 终端手动：

```bash
# 找到宝塔 PM2 自带的 node/pm2
find /www -name "pm2" -type f 2>/dev/null

# 加入 PATH 后手动启动
export PATH="/www/server/pm2/node/bin:$PATH"
cd /www/wwwroot/approval/server
pm2 start src/index.js --name approval-server
pm2 save
```

---

## 五、日常更新流程

详细配置步骤见 [GitHub 同步与自动部署指南](github-sync-setup.md)。

**自动更新（推荐）**：本地 push 代码 → GitHub Webhook → 服务器自动 git pull + 构建 + 重启。

**手动更新（备用）**：

```bash
cd /www/wwwroot/approval
git pull origin main              # 拉取最新代码

cd client
npm run build                     # 重新构建前端

pm2 restart approval-server       # 重启后端

# nginx -s reload                 # 仅改过 Nginx 配置才需要
```

---

## 六、常用命令速查

| 操作 | 命令 |
|------|------|
| 查看 PM2 进程 | `pm2 list` |
| 查看后端日志 | `pm2 logs approval-server` |
| 查看后端实时日志 | `pm2 logs approval-server --lines 50` |
| 重启后端 | `pm2 restart approval-server` |
| 后端健康检查 | `curl http://127.0.0.1:5000/api/health` |
| Nginx 配置测试 | `nginx -t` |
| 重载 Nginx | `nginx -s reload` |
| 查看生效的 Nginx 配置 | `nginx -T 2>/dev/null` |
| 查找文件 | `find /www -name "*.conf" -path "*39.96*"` |

---

## 七、关键文件路径

| 文件 | 路径 |
|------|------|
| Nginx 站点配置 | `/www/server/panel/vhost/nginx/39.96.18.98.conf` |
| 前端构建产物 | `/www/wwwroot/approval/client/build/` |
| 后端入口 | `/www/wwwroot/approval/server/src/index.js` |
| 后端环境变量 | `/www/wwwroot/approval/server/.env` |
| 前端 API 配置 | `/www/wwwroot/approval/client/src/api.js` |
