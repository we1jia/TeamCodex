#!/usr/bin/env bash
# ==============================================================================
# TeamCodex Hub Automated Deployment Script
# 适合本地局域网服务器、Linux VPS 或云主机的一键自动化中枢部署与自检脚本
# ==============================================================================

set -euo pipefail

PORT="${TEAM_CONTEXT_PORT:-18765}"
BIND_HOST="${TEAM_CONTEXT_BIND_HOST:-0.0.0.0}"
TARGET_DIR="${TARGET_DIR:-/opt/TeamCodex}"
REPO_URL="https://github.com/we1jia/TeamCodex.git"

echo "=========================================================="
echo "          TeamCodex Hub 自动化生产部署脚本                 "
echo "=========================================================="

# 1. 权限与系统检测
IS_ROOT=false
if [ "$(id -u)" -eq 0 ]; then
  IS_ROOT=true
fi

# 2. 准备代码仓库
if [ -d "$TARGET_DIR/.git" ]; then
  echo "[1/4] 目标目录已存在代码库，正在更新至最新 main..."
  git -C "$TARGET_DIR" pull --rebase origin main || true
elif [ -f "server/dev_host.mjs" ]; then
  echo "[1/4] 检测到当前目录即为 TeamCodex 源码目录，直接就地部署..."
  TARGET_DIR="$(pwd)"
else
  echo "[1/4] 正在克隆代码仓库到: $TARGET_DIR..."
  if [ "$IS_ROOT" = true ]; then
    mkdir -p "$(dirname "$TARGET_DIR")"
    git clone "$REPO_URL" "$TARGET_DIR"
  else
    TARGET_DIR="$HOME/TeamCodex"
    mkdir -p "$TARGET_DIR"
    git clone "$REPO_URL" "$TARGET_DIR"
  fi
fi

cd "$TARGET_DIR"

# 3. 部署方式决策（优先 Docker，次选原生 Node.js / Systemd / PM2）
DEPLOYED_VIA=""

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "[2/4] 检测到 Docker 与 Docker Compose，执行容器化一键部署..."
  docker compose up -d --build
  DEPLOYED_VIA="docker-compose"
elif command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -ge 18 ]; then
    echo "[2/4] 检测到 Node.js v$(node -v)，采用系统守护进程部署..."
    
    if [ "$IS_ROOT" = true ] && command -v systemctl >/dev/null 2>&1; then
      echo "      正在配置 Linux Systemd 守护服务 (teamcodex-hub.service)..."
      NODE_PATH=$(which node)
      cat <<EOF > /etc/systemd/system/teamcodex-hub.service
[Unit]
Description=TeamCodex Hub Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$TARGET_DIR
ExecStart=$NODE_PATH server/dev_host.mjs
Restart=always
RestartSec=3
Environment=TEAM_CONTEXT_BIND_HOST=$BIND_HOST
Environment=TEAM_CONTEXT_PORT=$PORT
Environment=TEAM_CONTEXT_DATA_DIR=$TARGET_DIR/data

[Install]
WantedBy=multi-user.target
EOF
      systemctl daemon-reload
      systemctl enable --now teamcodex-hub
      DEPLOYED_VIA="systemd"
    elif command -v pm2 >/dev/null 2>&1; then
      echo "      使用 PM2 常驻守护..."
      pm2 restart teamcodex-hub || pm2 start server/dev_host.mjs --name teamcodex-hub
      pm2 save || true
      DEPLOYED_VIA="pm2"
    else
      echo "      后台启动 Node.js 进程..."
      mkdir -p "$TARGET_DIR/data"
      nohup node server/dev_host.mjs > "$TARGET_DIR/data/hub.log" 2>&1 &
      DEPLOYED_VIA="nohup"
    fi
  else
    echo "错误: 本地 Node.js 版本低于 18 (当前: v$(node -v))，请升级或安装 Docker。" >&2
    exit 1
  fi
else
  echo "错误: 未检测到 Docker 或 Node.js (>= 18)。请先安装 Docker 或 Node.js。" >&2
  exit 1
fi

# 4. 健康度自检与验证
echo "[3/4] 正在等待服务就绪并执行健康检查..."
sleep 2

HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
PASSED=false
for i in {1..10}; do
  if curl -sS --max-time 2 "$HEALTH_URL" | grep -q '"ok":true'; then
    PASSED=true
    break
  fi
  sleep 1
done

if [ "$PASSED" != true ]; then
  echo "警告: 健康度检查超时，请通过以下日志排查:"
  if [ "$DEPLOYED_VIA" = "docker-compose" ]; then
    docker compose logs --tail=20
  elif [ "$DEPLOYED_VIA" = "systemd" ]; then
    journalctl -u teamcodex-hub -n 20 --no-pager
  fi
  exit 1
fi

# 5. 输出访问信息与协同口令
echo "[4/4] 部署成功!"
echo "=========================================================="
echo "部署方式: $DEPLOYED_VIA"
echo "本地地址: http://127.0.0.1:${PORT}"

PRIMARY_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "127.0.0.1")
echo "局域网地址: http://${PRIMARY_IP}:${PORT}"
echo ""
echo "协同连接口令示例 (Smart Token):"
echo "  Hub: http://${PRIMARY_IP}:${PORT} | Room: 1024 | Key: 123456"
echo ""
echo "若部署在公网，请参考 docs/HUB_DEPLOYMENT.md 配置域名 SSL 与 Nginx 反代。"
echo "=========================================================="
