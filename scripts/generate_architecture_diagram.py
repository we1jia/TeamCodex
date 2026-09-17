#!/usr/bin/env python3
"""
生成 TeamCodex 工业级硬核系统架构图 (基于 HTML5/CSS3 Grid + Chrome 2x Retina 渲染)
彻底解决文本溢出与生硬排版问题，达到 Linear / Vercel / Stripe 工业设计级水准。

输出:
  - docs/assets/architecture_zh.png (中文架构图 2880x1800 @2x)
  - docs/assets/architecture_en.png (英文架构图 2880x1800 @2x)
  - docs/assets/architecture.png    (默认架构图，对齐中文版)
"""

import os
import shutil
import subprocess
import tempfile

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
ASSETS_DIR = os.path.join(TC_DIR, "docs", "assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if not os.path.exists(CHROME_BIN):
    # 尝试在 PATH 中查找
    CHROME_BIN = shutil.which("google-chrome") or shutil.which("chromium")


def get_html_template(lang="zh"):
    if lang == "zh":
        data = {
            "title": "TeamCodex 系统架构全景",
            "subtitle": "告别甩二手 AI 文档产生的误差，实现团队对话上下文与思维链的毫秒级无损对齐",
            "version_tag": "v1.0.2  •  原生 Node.js 18+  •  零外部依赖",
            "client_panel_title": "客户端运行时与 CDP 注入层",
            "client_tag": "CDP: 9222",
            "client_cards": [
                {
                    "title": "桌面原生宿主客户端",
                    "badge": "Native Host",
                    "items": [
                        "OpenAI Codex / ChatGPT 官方原生桌面客户端",
                        "启动参数自动绑定 9222 远程调试探测端口",
                        "完全无侵入，不修改客户端二进制或本地配置",
                    ],
                },
                {
                    "title": "无侵入挂载注入 (sidebar_fullscreen.js)",
                    "badge": "Shadow DOM",
                    "items": [
                        "无缝挂载于原生侧边栏，支持全屏协作工作区切换",
                        "Web Component 与 Shadow DOM 严格样式沙箱隔离",
                        "单选高亮互斥逻辑：切回历史对话 100% 恢复原生高亮",
                    ],
                },
                {
                    "title": "状态机与协同协议解析",
                    "badge": "State Engine",
                    "items": [
                        "智能协同口令解析 (Smart Token: Hub | Room | Key)",
                        "对话会话脱敏引擎：剔除私有绝对路径与 Shell 命令",
                        "跨端设备类型自动感知 (Mac 宿主 / Windows 虚拟机)",
                    ],
                },
            ],
            "bus_title": "双向通信管道",
            "bus_up_name": "HTTP 变更",
            "bus_up_type": "POST (JSON)",
            "bus_down_name": "实时流推",
            "bus_down_type": "SSE (Push)",
            "hub_panel_title": "TeamCodex 协同中枢引擎 (server/dev_host.mjs)",
            "hub_tag": "PORT: 18765",
            "hub_cards": [
                {
                    "title": "房间隔离与安全鉴权",
                    "badge": "Security Gates",
                    "items": [
                        "多房间完全逻辑隔离与口令哈希防篡改校验",
                        "401 鉴权失效自动恢复与密钥自动携带重连",
                        "基于客户端 Message ID 的严格幂等防重机制",
                    ],
                },
                {
                    "title": "原生实时 SSE 事件总线",
                    "badge": "HTTP Streaming",
                    "items": [
                        "纯原生 Node.js HTTP Streaming，零外部 npm 依赖",
                        "冷启动延迟 < 15ms，轻量常驻，内存占用极低",
                        "实时广播：会话快照入库、协同消息增量即刻触达",
                    ],
                },
                {
                    "title": "多端在线感知与去重",
                    "badge": "Presence Matrix",
                    "items": [
                        "智能识别 Mac 宿主与 Windows 虚拟机网络拓扑",
                        "同一开发人员多设备在线人数动态合并去重",
                        "心跳保活检测与幽灵失联节点平滑安全回收",
                    ],
                },
                {
                    "title": "上下文存储与快照归档",
                    "badge": "Persistence",
                    "items": [
                        "原子化磁盘刷新存储 (data/messages.json)",
                        "脱敏快照结构化归档与一键导入当前活动对话",
                        "跨进程共享通道服务发现 (hub_discovery.json)",
                    ],
                },
            ],
            "metrics": [
                {"label": "冷启动延迟", "val": "< 15ms"},
                {"label": "第三方依赖", "val": "0 npm pkgs"},
                {"label": "通信架构", "val": "Native SSE Bus"},
                {"label": "数据与隐私", "val": "100% 本地自建 / 零遥测"},
            ],
            "topo_panel_title": "三级网络拓扑与部署模型",
            "topo_tag": "Network Topologies",
            "topos": [
                {
                    "num": "01",
                    "title": "模式 1: 本地跨端开发",
                    "sub": "Mac 宿主 + Windows 虚拟机 (Parallels / VMware)",
                    "items": [
                        "Mac 端后台静默启动协同中枢 (18765)",
                        "Windows 虚拟机自动探测宿主机 IP (10.211.55.2)",
                        "虚拟机客户端开箱即连，零手动配置负担",
                    ],
                },
                {
                    "num": "02",
                    "title": "模式 2: 团队局域网协同",
                    "sub": "办公室内常开开发机 / Mac mini / 本地 NAS",
                    "items": [
                        "执行 deploy-hub.sh 或直接通过 Node 启动中枢",
                        "同一局域网 / Wi-Fi 客户端填入内网 IP 直连",
                        "专为 5 ~ 30 人研发小组设计，安全可控",
                    ],
                },
                {
                    "num": "03",
                    "title": "模式 3: 私有云 VPS 部署",
                    "sub": "Linux 云服务器 (Docker Compose / Systemd)",
                    "items": [
                        "一键容器编排启动，配置独立域名与 SSL",
                        "Nginx 反代声明 proxy_buffering off 确保 SSE 流式畅通",
                        "支持跨地域分布式远程工程团队随时接入",
                    ],
                },
            ],
        }
    else:
        data = {
            "title": "TeamCodex System Architecture",
            "subtitle": "Stop cascading errors from tossing static AI docs. Align reasoning chains and context instantly across teams",
            "version_tag": "v1.0.2  •  Native Node.js 18+  •  Zero Dependencies",
            "client_panel_title": "Client Runtime & CDP Injection Layer",
            "client_tag": "CDP: 9222",
            "client_cards": [
                {
                    "title": "Desktop Host Client",
                    "badge": "Native Host",
                    "items": [
                        "OpenAI Codex / ChatGPT official desktop applications",
                        "Auto-binds port 9222 remote debugging probe upon launch",
                        "Zero modifications to binary executables or user configs",
                    ],
                },
                {
                    "title": "CDP Mounting Engine (sidebar_fullscreen.js)",
                    "badge": "Shadow DOM",
                    "items": [
                        "Seamlessly embedded in sidebar; fullscreen workspace toggle",
                        "Web Components & Shadow DOM for strict CSS sandbox isolation",
                        "Single-selection mutual exclusion: native state restored on exit",
                    ],
                },
                {
                    "title": "State Machine & Smart Token Parser",
                    "badge": "State Engine",
                    "items": [
                        "Instant Smart Token resolution (Hub | Room | Key)",
                        "Privacy engine: strips sensitive local paths and shell history",
                        "Automatic node identity resolution (Mac Host vs Windows VM)",
                    ],
                },
            ],
            "bus_title": "Communication Bus",
            "bus_up_name": "HTTP REST",
            "bus_up_type": "POST (JSON)",
            "bus_down_name": "Event Stream",
            "bus_down_type": "SSE (Push)",
            "hub_panel_title": "TeamCodex Hub Core Engine (server/dev_host.mjs)",
            "hub_tag": "PORT: 18765",
            "hub_cards": [
                {
                    "title": "Room Isolation & Security Gates",
                    "badge": "Security Gates",
                    "items": [
                        "Dynamic room partitioning with SHA hash verification",
                        "401 Unauthorized self-healing and auto key carryover",
                        "Client Message ID idempotency and duplicate elimination",
                    ],
                },
                {
                    "title": "Native Real-time SSE Event Bus",
                    "badge": "HTTP Streaming",
                    "items": [
                        "Pure Node.js standard HTTP streaming, zero external npm packages",
                        "Cold-start latency < 15ms with negligible memory footprint",
                        "Real-time event broadcasting: thread snapshots, instant chats",
                    ],
                },
                {
                    "title": "Presence & Device Identification",
                    "badge": "Presence Matrix",
                    "items": [
                        "Topology inspection for Mac Host vs Windows VM nodes",
                        "Dynamic active user deduplication across multi-device sessions",
                        "Heartbeat monitoring and graceful ghost-node reclamation",
                    ],
                },
                {
                    "title": "Context Storage & Snapshot Relays",
                    "badge": "Persistence",
                    "items": [
                        "Atomic disk serialization to data/messages.json",
                        "Privacy-safe snapshot archiving with one-click thread injection",
                        "Shared cross-process hub discovery channel (hub_discovery.json)",
                    ],
                },
            ],
            "metrics": [
                {"label": "Cold Start", "val": "< 15ms"},
                {"label": "Dependencies", "val": "0 npm pkgs"},
                {"label": "Engine Bus", "val": "Native SSE Bus"},
                {"label": "Privacy", "val": "100% Self-Hosted / Zero Telemetry"},
            ],
            "topo_panel_title": "Three-Tier Deployment Topology Models",
            "topo_tag": "Network Topologies",
            "topos": [
                {
                    "num": "01",
                    "title": "Model 1: Local Cross-OS",
                    "sub": "Mac Host + Windows VM (Parallels / VMware)",
                    "items": [
                        "Mac background spawns Hub silently on port 18765",
                        "Windows VM auto-probes host bridge IP (10.211.55.2)",
                        "Zero manual setup: works immediately inside VM out-of-the-box",
                    ],
                },
                {
                    "num": "02",
                    "title": "Model 2: Private LAN Collab",
                    "sub": "Dedicated Office Workstation / Mac mini / Local NAS",
                    "items": [
                        "Deploy via deploy-hub.sh or direct node execution",
                        "Team joins via LAN IP or single-line Smart Token",
                        "Tailored for 5 ~ 30 engineer co-located engineering squads",
                    ],
                },
                {
                    "num": "03",
                    "title": "Model 3: Cloud VPS Deployment",
                    "sub": "Linux Cloud Instance (Docker Compose / Systemd)",
                    "items": [
                        "Production container setup with custom domain and SSL",
                        "Nginx reverse proxy with proxy_buffering off for streaming",
                        "Global access for distributed remote-first engineering teams",
                    ],
                },
            ],
        }

    # 构建 HTML 字符串
    client_cards_html = "".join(
        f"""
        <div class="subcard">
          <div class="subcard-header">
            <span class="subcard-title">{c['title']}</span>
            <span class="subcard-badge">{c['badge']}</span>
          </div>
          <ul class="subcard-list">
            {"".join(f'<li><span class="dash">-</span><span>{it}</span></li>' for it in c['items'])}
          </ul>
        </div>
        """
        for c in data["client_cards"]
    )

    hub_cards_html = "".join(
        f"""
        <div class="subcard">
          <div class="subcard-header">
            <span class="subcard-title">{c['title']}</span>
            <span class="subcard-badge">{c['badge']}</span>
          </div>
          <ul class="subcard-list">
            {"".join(f'<li><span class="dash">-</span><span>{it}</span></li>' for it in c['items'])}
          </ul>
        </div>
        """
        for c in data["hub_cards"]
    )

    metrics_html = "".join(
        f"""
        <div class="metric-item">
          <span class="metric-label">{m['label']}</span>
          <span class="metric-val">{m['val']}</span>
        </div>
        """
        for m in data["metrics"]
    )

    topos_html = "".join(
        f"""
        <div class="topo-card">
          <div class="topo-header">
            <span class="topo-num">{t['num']}</span>
            <div class="topo-title-group">
              <span class="topo-title">{t['title']}</span>
              <span class="topo-sub">{t['sub']}</span>
            </div>
          </div>
          <ul class="subcard-list">
            {"".join(f'<li><span class="dash">-</span><span>{it}</span></li>' for it in t['items'])}
          </ul>
        </div>
        """
        for t in data["topos"]
    )

    html = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<style>
* {{
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}}

body {{
  width: 1440px;
  height: 900px;
  background-color: #09090b;
  background-image: radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px);
  background-size: 24px 24px;
  color: #ededed;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Segoe UI", Roboto, sans-serif;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}}

/* 顶部 Header */
.header {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
}}
.header-left {{
  display: flex;
  flex-direction: column;
  gap: 4px;
}}
.header-title-row {{
  display: flex;
  align-items: center;
  gap: 12px;
}}
.header-title {{
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #ffffff;
}}
.status-dot {{
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f97316;
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.7);
  display: inline-block;
}}
.header-subtitle {{
  font-size: 13px;
  color: #a1a1aa;
  font-weight: 400;
}}
.header-badge {{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(24, 24, 27, 0.85);
  border: 1px solid rgba(249, 115, 22, 0.35);
  padding: 6px 14px;
  border-radius: 6px;
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #fb923c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}}

/* 主内容两栏区 */
.main-grid {{
  display: grid;
  grid-template-columns: 420px 88px 1fr;
  gap: 14px;
  height: 520px;
}}

/* 一级大卡片面板 */
.panel {{
  background: #111114;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.03);
}}

.panel-header {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}}
.panel-title-group {{
  display: flex;
  align-items: center;
  gap: 8px;
}}
.panel-title {{
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #f4f4f5;
}}
.panel-tag {{
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  color: #ea580c;
  background: rgba(234, 88, 12, 0.1);
  border: 1px solid rgba(234, 88, 12, 0.25);
  padding: 2px 8px;
  border-radius: 4px;
}}

/* 客户端卡片列表 */
.client-cards {{
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  justify-content: space-between;
}}

/* 二级子卡片 (彻底去除左边框) */
.subcard {{
  background: #16161b;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 11px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.2s ease;
}}
.subcard-header {{
  display: flex;
  justify-content: space-between;
  align-items: center;
}}
.subcard-title {{
  font-size: 12.5px;
  font-weight: 600;
  color: #ededed;
}}
.subcard-badge {{
  font-size: 10px;
  font-family: "SF Mono", Menlo, Consolas, monospace;
  color: #71717a;
  background: rgba(255, 255, 255, 0.04);
  padding: 1px 6px;
  border-radius: 4px;
}}
.subcard-list {{
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}}
.subcard-list li {{
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  color: #a1a1aa;
  line-height: 1.45;
}}
.dash {{
  color: #f97316;
  font-weight: 700;
  flex-shrink: 0;
}}

/* 中间通信总线 */
.bus-bridge {{
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 16px;
  background: #111114;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 12px 6px;
}}
.bus-channel {{
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  width: 100%;
}}
.bus-label {{
  font-size: 11px;
  font-weight: 600;
  color: #f4f4f5;
}}
.bus-type {{
  font-size: 9.5px;
  font-family: "SF Mono", Menlo, Consolas, monospace;
  color: #fb923c;
}}
.bus-arrow {{
  color: #f97316;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: -1px;
}}
.bus-divider {{
  width: 60%;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}}

/* Hub 4 格与指标条 */
.hub-content {{
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  justify-content: space-between;
}}
.hub-grid {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}}

.metrics-bar {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  background: #16161b;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 8px 12px;
}}
.metric-item {{
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  padding-right: 6px;
}}
.metric-item:last-child {{
  border-right: none;
}}
.metric-label {{
  font-size: 10px;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}}
.metric-val {{
  font-size: 12px;
  font-weight: 600;
  color: #fb923c;
  font-family: "SF Mono", Menlo, Consolas, monospace;
}}

/* 底部三级拓扑 */
.topo-panel {{
  background: #111114;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 6px 20px -2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03);
}}
.topo-grid {{
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}}
.topo-card {{
  background: #16161b;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}}
.topo-header {{
  display: flex;
  align-items: flex-start;
  gap: 10px;
}}
.topo-num {{
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #f97316;
  background: rgba(249, 115, 22, 0.12);
  border: 1px solid rgba(249, 115, 22, 0.25);
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}}
.topo-title-group {{
  display: flex;
  flex-direction: column;
  gap: 2px;
}}
.topo-title {{
  font-size: 12.5px;
  font-weight: 600;
  color: #f4f4f5;
}}
.topo-sub {{
  font-size: 10.5px;
  color: #ea580c;
  font-weight: 500;
}}
</style>
</head>
<body>

  <!-- 顶部 Header -->
  <header class="header">
    <div class="header-left">
      <div class="header-title-row">
        <span class="status-dot"></span>
        <h1 class="header-title">{data['title']}</h1>
      </div>
      <p class="header-subtitle">{data['subtitle']}</p>
    </div>
    <div class="header-badge">{data['version_tag']}</div>
  </header>

  <!-- 中间核心双栏交互区 -->
  <main class="main-grid">
    <!-- 客户端运行时 -->
    <section class="panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="status-dot"></span>
          <span class="panel-title">{data['client_panel_title']}</span>
        </div>
        <span class="panel-tag">{data['client_tag']}</span>
      </div>
      <div class="client-cards">
        {client_cards_html}
      </div>
    </section>

    <!-- 中间通信总线 -->
    <div class="bus-bridge">
      <div class="bus-channel">
        <span class="bus-label">{data['bus_up_name']}</span>
        <span class="bus-type">{data['bus_up_type']}</span>
        <span class="bus-arrow">➔</span>
      </div>
      <div class="bus-divider"></div>
      <div class="bus-channel">
        <span class="bus-arrow">⬅</span>
        <span class="bus-label">{data['bus_down_name']}</span>
        <span class="bus-type">{data['bus_down_type']}</span>
      </div>
    </div>

    <!-- 协同中枢引擎 -->
    <section class="panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="status-dot"></span>
          <span class="panel-title">{data['hub_panel_title']}</span>
        </div>
        <span class="panel-tag">{data['hub_tag']}</span>
      </div>
      <div class="hub-content">
        <div class="hub-grid">
          {hub_cards_html}
        </div>
        <div class="metrics-bar">
          {metrics_html}
        </div>
      </div>
    </section>
  </main>

  <!-- 底部三级网络拓扑 -->
  <footer class="topo-panel">
    <div class="panel-header" style="margin-bottom: 10px;">
      <div class="panel-title-group">
        <span class="status-dot"></span>
        <span class="panel-title">{data['topo_panel_title']}</span>
      </div>
      <span class="panel-tag">{data['topo_tag']}</span>
    </div>
    <div class="topo-grid">
      {topos_html}
    </div>
  </footer>

</body>
</html>
"""
    return html


def render_html_to_png(html_content, output_png_path):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(html_content)
        temp_html = f.name

    try:
        cmd = [
            CHROME_BIN,
            "--headless",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=2",
            "--window-size=1440,900",
            f"--screenshot={output_png_path}",
            f"file://{os.path.abspath(temp_html)}",
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            raise RuntimeError(f"Chrome screenshot failed: {res.stderr.decode('utf-8', errors='ignore')}")
    finally:
        if os.path.exists(temp_html):
            os.remove(temp_html)


def main():
    if not CHROME_BIN or not os.path.exists(CHROME_BIN):
        raise FileNotFoundError("未检测到 Chrome 可执行文件，无法进行 Retina 渲染")

    print(f"[*] 使用渲染引擎: {CHROME_BIN}")

    # 1. 生成中文架构图 (Retina 2x)
    zh_html = get_html_template("zh")
    zh_path = os.path.join(ASSETS_DIR, "architecture_zh.png")
    render_html_to_png(zh_html, zh_path)
    print(f"[SUCCESS] 中文工业架构图已生成 (Retina 2x): {zh_path} ({os.path.getsize(zh_path)} 字节)")

    # 2. 生成英文架构图 (Retina 2x)
    en_html = get_html_template("en")
    en_path = os.path.join(ASSETS_DIR, "architecture_en.png")
    render_html_to_png(en_html, en_path)
    print(f"[SUCCESS] 英文工业架构图已生成 (Retina 2x): {en_path} ({os.path.getsize(en_path)} 字节)")

    # 3. 同步默认架构图为中文版本
    default_path = os.path.join(ASSETS_DIR, "architecture.png")
    shutil.copyfile(zh_path, default_path)
    print(f"[SUCCESS] 默认架构图已同步: {default_path} ({os.path.getsize(default_path)} 字节)")


if __name__ == "__main__":
    main()


