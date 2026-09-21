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
if [ "$IS_ROOT" = false ] && [ "$TARGET_DIR" = "/opt/TeamCodex" ]; then
  TARGET_DIR="$HOME/TeamCodex"
fi

if [ -d "$TARGET_DIR/.git" ]; then
  echo "[1/4] 目标目录已存在代码库，正在更新至最新 main..."
  git -C "$TARGET_DIR" pull --rebase origin main || true
elif [ -f "$TARGET_DIR/server/dev_host.mjs" ]; then
  echo "[1/4] 目标目录已存在 TeamCodex 核心文件，直接就地部署..."
elif [ -f "server/dev_host.mjs" ]; then
  echo "[1/4] 检测到当前目录即为 TeamCodex 源码目录，直接就地部署..."
  TARGET_DIR="$(pwd)"
else
  echo "[1/4] 正在克隆代码仓库到: $TARGET_DIR..."
  mkdir -p "$(dirname "$TARGET_DIR")"
  git clone "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR"

# 3. 部署方式决策（优先可用 Docker，次选原生 Node.js / Systemd / PM2）
DEPLOYED_VIA=""

CAN_DOCKER=false
DOCKER_COMPOSE_CMD=""

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    CAN_DOCKER=true
    DOCKER_COMPOSE_CMD="docker compose"
  elif [ "$IS_ROOT" = false ] && command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1 && sudo -n docker compose version >/dev/null 2>&1; then
    CAN_DOCKER=true
    DOCKER_COMPOSE_CMD="sudo docker compose"
  fi
fi

if [ "$CAN_DOCKER" = true ]; then
  echo "[2/4] 检测到 Docker 与守护进程权限正常，执行容器化一键部署..."
  $DOCKER_COMPOSE_CMD up -d --build
  DEPLOYED_VIA="docker-compose"
elif command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -ge 18 ]; then
    echo "[2/4] 检测到 Node.js v$(node -v)（纯原生轻量模式，零 npm 依赖），采用常驻守护部署..."
    
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
      echo "      后台启动 Node.js 进程并配置开机自启..."
      mkdir -p "$TARGET_DIR/data"
      
      # 编写可重复调用的守护脚本
      cat <<'STARTEOF' > "$TARGET_DIR/start-hub.sh"
#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
mkdir -p "$DIR/data"
OLD_PID=$(pgrep -f "server/dev_host.mjs" || true)
if [ -n "$OLD_PID" ]; then
  kill $OLD_PID 2>/dev/null || true
  sleep 1
fi
export TEAM_CONTEXT_BIND_HOST="${TEAM_CONTEXT_BIND_HOST:-0.0.0.0}"
export TEAM_CONTEXT_PORT="${TEAM_CONTEXT_PORT:-18765}"
export TEAM_CONTEXT_DATA_DIR="$DIR/data"
nohup node server/dev_host.mjs >> "$DIR/data/hub.log" 2>&1 &
STARTEOF
      chmod +x "$TARGET_DIR/start-hub.sh"
      "$TARGET_DIR/start-hub.sh"
      
      # 注册用户 Crontab @reboot 开机自启
      if command -v crontab >/dev/null 2>&1; then
        (crontab -l 2>/dev/null | grep -v "$TARGET_DIR/start-hub.sh" || true; echo "@reboot $TARGET_DIR/start-hub.sh") | crontab - 2>/dev/null || true
      fi
      DEPLOYED_VIA="nohup (已注册开机自启)"
    fi
  else
    echo "错误: 本地 Node.js 版本低于 18 (当前: v$(node -v))，请升级或安装 Docker。" >&2
    exit 1
  fi
else
  echo "错误: 未检测到可用 Docker 或 Node.js (>= 18)。请先安装 Docker 或 Node.js。" >&2
  exit 1
fi

# 4. 健康度自检与验证
echo "[3/4] 正在等待服务就绪并执行健康检查..."
sleep 2

HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
PASSED=false
for i in {1..10}; do
  if curl -sS --max-time 2 "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true'; then
    PASSED=true
    break
  fi
  sleep 1
done

if [ "$PASSED" != true ]; then
  echo "警告: 健康度检查超时，请通过以下日志排查:"
  if [ "$DEPLOYED_VIA" = "docker-compose" ]; then
    $DOCKER_COMPOSE_CMD logs --tail=20
  elif [ "$DEPLOYED_VIA" = "systemd" ]; then
    journalctl -u teamcodex-hub -n 20 --no-pager
  else
    cat "$TARGET_DIR/data/hub.log" 2>/dev/null | tail -n 20 || true
  fi
  exit 1
fi

# 5. 输出访问信息与协同口令
echo "[4/4] 部署成功!"
echo "=========================================================="
echo "部署方式: $DEPLOYED_VIA"
echo "本地地址: http://127.0.0.1:${PORT}"

ALL_IPS=$(hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || echo "127.0.0.1")
PRIMARY_LAN_IP=""
TAILSCALE_IP=""

for ip in $ALL_IPS; do
  if [[ "$ip" =~ ^100\. ]]; then
    TAILSCALE_IP="$ip"
  elif [[ "$ip" =~ ^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1])) ]] && [ -z "$PRIMARY_LAN_IP" ]; then
    PRIMARY_LAN_IP="$ip"
  fi
done

[ -z "$PRIMARY_LAN_IP" ] && PRIMARY_LAN_IP=$(echo "$ALL_IPS" | awk '{print $1}')

if [ -n "$PRIMARY_LAN_IP" ]; then
  echo "局域网地址: http://${PRIMARY_LAN_IP}:${PORT}"
fi

if [ -n "$TAILSCALE_IP" ]; then
  echo "Tailscale:  http://${TAILSCALE_IP}:${PORT}"
fi

PUBLIC_IP=$(curl -sS --max-time 2 https://api.ipify.org 2>/dev/null || true)
if [ -n "$PUBLIC_IP" ]; then
  echo "外网公网IP: http://${PUBLIC_IP}:${PORT} (需确保云控制台安全组放行 ${PORT} 端口)"
fi

CHOSEN_IP="${TAILSCALE_IP:-$PRIMARY_LAN_IP}"
echo ""
echo "协同连接口令示例 (Smart Token - 默认系统空间):"
echo "  Hub: http://${CHOSEN_IP}:${PORT} | Room: Media"
echo ""
echo "若部署在公网，建议参考 docs/HUB_DEPLOYMENT.md 配置域名 SSL 与 Nginx 反代。"
echo "=========================================================="
