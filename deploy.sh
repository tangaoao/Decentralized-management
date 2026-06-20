#!/bin/bash
# ============================================
# 二次发放审批系统 - 一键部署脚本
# 环境：宝塔面板 + Nginx + Node.js + PM2
# 用法：
#   chmod +x deploy.sh
#   ./deploy.sh            # 首次部署
#   ./deploy.sh update     # 日常更新（跳过 install）
# ============================================
set -e

# ==================== 配置区（按你的实际路径修改） ====================
PROJECT_DIR="/www/wwwroot/approval"            # 项目根目录
BUILD_DIR="${PROJECT_DIR}/client/build"         # 前端构建产物目录
SERVER_DIR="${PROJECT_DIR}/server"              # 后端目录
PM2_NAME="approval-server"                      # PM2 进程名称
NGINX_RELOAD="nginx -s reload"                  # 重载 Nginx 命令（宝塔）


# ==================== 颜色输出 ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }


# ==================== 第一步：拉取最新代码 ====================
step "拉取最新代码"

cd "$PROJECT_DIR"

if [ -d ".git" ]; then
    git pull && log "代码已更新" || warn "Git pull 失败，使用当前代码继续"
else
    warn "非 Git 仓库，跳过拉取，使用当前文件"
fi


# ==================== 第二步：构建前端 ====================
step "构建前端"

cd "${PROJECT_DIR}/client"

if [ "$1" != "update" ]; then
    npm install
    log "前端依赖安装完成"
else
    warn "跳过 npm install（update 模式）"
fi

echo "开始构建 React 前端..."
npm run build
log "前端构建完成 → ${BUILD_DIR}"


# ==================== 第三步：安装后端依赖 ====================
step "安装后端依赖"

cd "$SERVER_DIR"

if [ "$1" != "update" ]; then
    npm install
    log "后端依赖安装完成"
else
    warn "跳过 npm install（update 模式）"
fi


# ==================== 第四步：检查环境变量 ====================
step "检查环境配置"

if [ ! -f "${SERVER_DIR}/.env" ]; then
    warn ".env 文件不存在，正在创建..."
    # 生成随机密钥
    RANDOM_SECRET=$(date +%s | sha256sum | base64 | head -c 32)
    cat > "${SERVER_DIR}/.env" << EOF
JWT_SECRET=${RANDOM_SECRET}
PORT=5000
EOF
    log ".env 文件已自动生成（JWT_SECRET 已随机生成）"
else
    log ".env 文件已存在"
fi


# ==================== 第五步：启动/重启后端 ====================
step "启动后端服务"

cd "$SERVER_DIR"

if pm2 list | grep -q "$PM2_NAME"; then
    pm2 restart "$PM2_NAME"
    log "PM2 已重启进程: ${PM2_NAME}"
else
    pm2 start src/index.js --name "$PM2_NAME"
    pm2 save
    log "PM2 已创建并启动进程: ${PM2_NAME}"
fi

# 等待服务启动
sleep 2


# ==================== 第六步：健康检查 ====================
step "健康检查"

if curl -sf http://127.0.0.1:5000/api/health > /dev/null 2>&1; then
    log "后端健康检查通过 ✓"
else
    warn "后端健康检查失败，请检查日志: pm2 logs ${PM2_NAME}"
fi


# ==================== 第七步：重载 Nginx ====================
step "重载 Nginx"

if ! nginx -t 2>&1; then
    err "Nginx 配置语法错误，请检查后再重试"
fi

$NGINX_RELOAD
log "Nginx 已重载"


# ==================== 部署完成 ====================
echo ""
echo -e "${GREEN}╔════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✓  部署完成！                  ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  后端地址:  http://IP:5000/api     ║${NC}"
echo -e "${GREEN}║  前端入口:  http://你的域名/        ║${NC}"
echo -e "${GREEN}║  查看日志:  pm2 logs ${PM2_NAME}    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════╝${NC}"
echo ""
echo "首次部署别忘了把 ${BUILD_DIR} 设为 Nginx 的网站根目录！"
echo "Nginx 配置参考: deploy/nginx.conf"
