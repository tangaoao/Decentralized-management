#!/bin/bash
# 二次发放审批系统 — 一键启动脚本 (Linux/macOS)
# 用途：同时启动后端 (Express :5000) 和前端 (React :3000)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT/server"
CLIENT_DIR="$ROOT/client"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # 无颜色

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  二次发放审批系统 — 一键启动${NC}"
echo -e "${CYAN}========================================${NC}"

# 1. 设置 JWT 密钥
export JWT_SECRET="secondary_approval_jwt_secret_2026"
echo -e "\n${GREEN}[1/4] JWT_SECRET 已设置${NC}"

# 2. 后端依赖检查与安装
if [ ! -d "$SERVER_DIR/node_modules" ]; then
    echo -e "${YELLOW}[2/4] 安装后端依赖...${NC}"
    cd "$SERVER_DIR" && npm install
else
    echo -e "${GREEN}[2/4] 后端依赖已就绪${NC}"
fi

# 3. 前端依赖检查与安装
if [ ! -d "$CLIENT_DIR/node_modules" ]; then
    echo -e "${YELLOW}[3/4] 安装前端依赖...${NC}"
    cd "$CLIENT_DIR" && npm install
else
    echo -e "${GREEN}[3/4] 前端依赖已就绪${NC}"
fi

# 4. 启动服务
echo -e "${GREEN}[4/4] 启动后端 & 前端...${NC}\n"
echo -e "${WHITE}后端: http://localhost:5000${NC}"
echo -e "${WHITE}前端: http://localhost:3000${NC}"
echo -e "按 Ctrl+C 停止所有服务\n"

# 捕获退出信号，停止后台进程
cleanup() {
    echo -e "\n${YELLOW}正在停止服务...${NC}"
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
    wait $CLIENT_PID 2>/dev/null
    echo -e "${GREEN}服务已停止${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM

# 启动后端
cd "$SERVER_DIR"
npm start &
SERVER_PID=$!
echo -e "后端 PID: $SERVER_PID"

# 启动前端
cd "$CLIENT_DIR"
npm start &
CLIENT_PID=$!
echo -e "前端 PID: $CLIENT_PID"

# 等待后端就绪
echo -e "\n${YELLOW}等待服务就绪...${NC}"
for i in $(seq 1 30); do
    if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 后端已就绪${NC}"
        break
    fi
    sleep 1
done

# 等待前端就绪
for i in $(seq 1 60); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q 200; then
        echo -e "${GREEN}✓ 前端已就绪${NC}"
        break
    fi
    sleep 1
done

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}  系统启动完成！浏览器打开:${NC}"
echo -e "${WHITE}  http://localhost:3000${NC}"
echo -e "${CYAN}========================================${NC}"

# 等待后台进程（防止脚本退出）
wait
