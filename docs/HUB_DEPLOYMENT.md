# TeamCodex 中枢服务部署与网络接入全景指南 / Hub Deployment & Networking Guide

[English](#english) | [中文](#中文)

---

<a id="中文"></a>

## 中文

### 1. 中枢服务定位

TeamCodex Hub（`server/dev_host.mjs`）是整个协同体系的实时状态与消息交换中枢。

它采用原生 Node.js HTTP 与 Server-Sent Events (SSE) 事件总线架构，负责多房间隔离、访问密码鉴权（Room Key）、在线成员心跳感知、只读快照存储与上下文下发。该服务是**纯原生轻量级实现，零外部第三方 npm 依赖**，冷启动耗时低于 20ms。

```
+-----------------------------------------------------------------------+
|                           TeamCodex Hub                               |
|                     (Default Port: 18765)                             |
+-----------------------------------+-----------------------------------+
                                    |
      +-----------------------------+-----------------------------+
      | (Localhost / Parallels)     | (LAN Wi-Fi / Ethernet)      | (Internet / HTTPS)
      v                             v                             v
[方案 1: 单机跨端协同]       [方案 2: 局域网私有协作]     [方案 3: 云端公网部署]
Mac 宿主 + Win 虚拟机        办公室/实验室同内网团队       跨地域分布式远程团队
```

### 2. 部署方案选型

根据团队的使用场景，TeamCodex 支持三种标准网络拓扑：

| 部署模式 | 适用场景 | 服务端运行位置 | 客户端接入方式 | 网络要求 |
|---|---|---|---|---|
| **方案 1：单机跨端（默认）** | 单人拥有 Mac 并在同一机器运行 Windows 虚拟机（Parallels 等） | Mac 宿主机后台自动运行 | 客户端自动探测宿主机 IP，零配置直连 | 本地主机与虚拟网络 |
| **方案 2：局域网私有协同** | 同一办公区、家庭实验室、同 Wi-Fi 或专用路由器网络的小组 | 局域网内任意一台常开 PC、Mac 或 NAS | 填入该主机的内网 IP，或通过 Smart Token 秒连 | 处于同一网段（如 192.168.x.x） |
| **方案 3：云端服务器部署** | 跨地域、远程办公、异地协作的团队 | 任何 Linux 云服务器（阿里云/腾讯云/AWS/自建机房） | 配置域名与 HTTPS，各端通过公网域名接入 | 云服务器开放端口，建议配置 SSL |

---

### 3. 服务端部署方式

#### 方式 A：Docker Compose 部署（推荐用于服务器）

在服务器任意目录克隆或放置文件，直接运行容器：

```bash
# 1. 启动服务（后台运行）
docker compose up -d

# 2. 检查运行状态与健康度
docker compose ps
curl http://127.0.0.1:18765/api/health
```

服务将自动挂载本地 `./data` 目录用于持久化存储房间状态与快照。

#### 方式 B：PM2 进程守护（适用于常开主机或 VPS）

确保主机安装有 Node.js (>= 18)：

```bash
# 1. 全局安装 pm2（如未安装）
npm install -g pm2

# 2. 启动并持久化守护
pm2 start server/dev_host.mjs --name teamcodex-hub

# 3. 设置开机自启
pm2 startup
pm2 save
```

#### 方式 C：Linux Systemd 系统服务

创建服务描述文件 `/etc/systemd/system/teamcodex-hub.service`：

```ini
[Unit]
Description=TeamCodex Hub Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/TeamCodex
ExecStart=/usr/bin/node server/dev_host.mjs
Restart=always
RestartSec=5
Environment=TEAM_CONTEXT_BIND_HOST=0.0.0.0
Environment=TEAM_CONTEXT_PORT=18765
Environment=TEAM_CONTEXT_DATA_DIR=/opt/TeamCodex/data

[Install]
WantedBy=multi-user.target
```

执行激活：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now teamcodex-hub
```

---

### 4. 公网域名与反向代理（Nginx 配置）

在云端部署时，强烈建议配置 Nginx 并开启 SSL/HTTPS 加密。

> **特别注意**：由于 TeamCodex 依赖 Server-Sent Events (SSE) 进行实时流式广播，Nginx 必须显式关闭响应缓冲（`proxy_buffering off;`），否则会导致消息无法实时推送。

```nginx
server {
    listen 80;
    server_name hub.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name hub.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/hub.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hub.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:18765;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 核心：必须关闭缓冲区以支持 SSE 流式传输
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
    }
}
```

---

### 5. 环境变量参考表

可通过环境变量覆盖默认运行参数：

| 环境变量 | 默认值 | 作用说明 |
|---|---|---|
| `TEAM_CONTEXT_BIND_HOST` | `0.0.0.0` | 绑定的监听网卡地址（`0.0.0.0` 表示监听所有网卡） |
| `TEAM_CONTEXT_PORT` | `18765` | 服务监听端口 |
| `TEAM_CONTEXT_DATA_DIR` | `<根目录>/data` | 持久化数据文件及日志目录 |
| `TEAM_CONTEXT_DATA_FILE` | `<数据目录>/messages.json` | 房间、消息、快照等数据的存储文件 |

---

### 6. 客户端如何接入

无论中枢部署在本地局域网还是公网，客户端均支持以下三种接入途径：

#### 途径 1：智能协同口令一键秒连 (Smart Token)
1. 房主在已进入的房间右上方点击「复制口令」，生成标准口令，例如：
   ```text
   Hub: https://hub.yourdomain.com | Room: Project-Alpha | Key: 123456
   ```
2. 其他团队成员打开 TeamCodex，在房间搜索框或设置框直接粘贴该文本；
3. 系统自动解析提取中枢地址、目标房间与鉴权密钥并建立实时链路。

#### 途径 2：客户端界面直接输入配置
1. 点击全屏协作页面右上角的「设置」图标；
2. 在「中枢地址 (Hub URL)」填入中枢服务地址（如 `http://192.168.1.100:18765` 或 `https://hub.yourdomain.com`）；
3. 在「当前空间 (Room)」输入要进入的房间名，并填入访问密钥（如有）；
4. 点击保存，系统即刻建立连接。

#### 途径 3：启动参数与环境变量预设
针对企业标准化部署环境，可在启动前通过全局环境变量预置中枢地址：
- macOS：在终端或 shell profile 声明 `export TEAM_CONTEXT_HOST="https://hub.yourdomain.com"`
- Windows：在系统环境变量中设置 `TEAM_CONTEXT_HOST` 为对应地址。

---

<a id="english"></a>

## English

### 1. Hub Architecture Overview

TeamCodex Hub (`server/dev_host.mjs`) serves as the central message bus and real-time state synchronization hub across collaborative peers.

Architected with native Node.js HTTP and Server-Sent Events (SSE), the hub coordinates multi-room isolation, room key encryption gates, peer presence heartbeats, snapshot archiving, and context broadcasts. The server is implemented with **zero third-party npm dependencies**, achieving cold-start latencies under 20ms.

```
+-----------------------------------------------------------------------+
|                           TeamCodex Hub                               |
|                     (Default Port: 18765)                             |
+-----------------------------------+-----------------------------------+
                                    |
      +-----------------------------+-----------------------------+
      | (Localhost / Parallels)     | (LAN Wi-Fi / Ethernet)      | (Internet / HTTPS)
      v                             v                             v
[Model 1: Single-Host Cross-OS]  [Model 2: Private LAN Collab] [Model 3: Cloud VPS Hub]
Mac Host + Win Virtual Machine   Office / Lab Local Network    Distributed Remote Teams
```

### 2. Topology Models

TeamCodex supports three deployment topologies depending on collaborative scenarios:

| Topology Model | Target Scenario | Server Placement | Client Connection Method | Networking Requirements |
|---|---|---|---|---|
| **Model 1: Single-Host (Default)** | Solo developer operating Mac host and Windows VM (Parallels/UTM) | Automatically spawned by macOS launcher | Zero-config automatic peer detection | Localhost & virtual network bridge |
| **Model 2: Private LAN** | Co-located team in an office or lab sharing the same Wi-Fi/Ethernet | Dedicated workstation, Mac Mini, or local NAS | Clients enter the local IP or paste a Smart Token | Same subnet (e.g. 192.168.x.x) |
| **Model 3: Cloud Server** | Distributed, remote-first engineering teams | Any public Linux VPS (AWS, Azure, DigitalOcean, etc.) | Clients connect via domain name over HTTPS | Open port with SSL/TLS reverse proxy |

---

### 3. Server Deployment Guide

#### Method A: Docker Compose (Recommended for Servers)

```bash
# 1. Start service in background
docker compose up -d

# 2. Inspect container status and health
docker compose ps
curl http://127.0.0.1:18765/api/health
```

The service mounts `./data` into the container for zero-loss state persistence.

#### Method B: PM2 Process Manager

Ensure Node.js (>= 18) is installed:

```bash
# 1. Install PM2 globally
npm install -g pm2

# 2. Start daemon process
pm2 start server/dev_host.mjs --name teamcodex-hub

# 3. Persist across system reboots
pm2 startup
pm2 save
```

#### Method C: Linux Systemd Daemon

Create `/etc/systemd/system/teamcodex-hub.service`:

```ini
[Unit]
Description=TeamCodex Hub Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/TeamCodex
ExecStart=/usr/bin/node server/dev_host.mjs
Restart=always
RestartSec=5
Environment=TEAM_CONTEXT_BIND_HOST=0.0.0.0
Environment=TEAM_CONTEXT_PORT=18765
Environment=TEAM_CONTEXT_DATA_DIR=/opt/TeamCodex/data

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now teamcodex-hub
```

---

### 4. Reverse Proxy & HTTPS (Nginx Configuration)

When hosting publicly, terminating TLS via Nginx is strongly advised.

> **CRITICAL**: Because TeamCodex utilizes Server-Sent Events (SSE) for low-latency streaming, proxy buffering must be disabled (`proxy_buffering off;`). Otherwise, broadcasts will stall behind server buffers.

```nginx
server {
    listen 80;
    server_name hub.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name hub.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/hub.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hub.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:18765;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable response buffering for SSE stream continuity
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
    }
}
```

---

### 5. Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `TEAM_CONTEXT_BIND_HOST` | `0.0.0.0` | Network interface to bind (`0.0.0.0` listens on all available interfaces) |
| `TEAM_CONTEXT_PORT` | `18765` | TCP listening port |
| `TEAM_CONTEXT_DATA_DIR` | `<root>/data` | Directory for persistence storage and runtime logs |
| `TEAM_CONTEXT_DATA_FILE` | `<data_dir>/messages.json` | Path to persistent storage file |

---

### 6. Client Connection & Ingestion

#### 1. Instant Connection via Smart Token
1. Room moderators click "Copy Token" in the top bar:
   ```text
   Hub: https://hub.yourdomain.com | Room: Project-Alpha | Key: 123456
   ```
2. Teammates paste this string directly into the TeamCodex search bar or settings panel.
3. The parser deconstructs the endpoint, room, and key, establishing the SSE stream instantly.

#### 2. Manual Configuration in UI Settings
1. Click the "Settings" icon in the upper-right corner of the workspace.
2. Enter the Hub URL (e.g. `http://192.168.1.100:18765` or `https://hub.yourdomain.com`).
3. Set the target Room identifier and Key, then save.

#### 3. Environment Variable Pre-configuration
For enterprise workstations:
- macOS: Declare `export TEAM_CONTEXT_HOST="https://hub.yourdomain.com"` in `~/.zshrc`.
- Windows: Define `TEAM_CONTEXT_HOST` in User/System environment variables.
