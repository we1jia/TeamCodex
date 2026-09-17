#!/usr/bin/env python3
"""
生成 TeamCodex 工业级硬核系统架构图 (黑橙工业风 / 无左边框 / 严格中英文独立)
输出:
  - docs/assets/architecture_zh.png (中文架构图)
  - docs/assets/architecture_en.png (英文架构图)
  - docs/assets/architecture.png    (默认架构图，对齐中文版)
"""

import os
from PIL import Image, ImageDraw, ImageFont

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
ASSETS_DIR = os.path.join(TC_DIR, "docs", "assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

WIDTH, HEIGHT = 1600, 960

# -------------------------------------------------------------
# 严苛工业硬核黑橙调色盘 (No AI clichés, Zero generic blues)
# -------------------------------------------------------------
COLOR_BG = (10, 10, 12)             # #0A0A0C 纯深曜石底色
COLOR_GRID = (24, 24, 28)           # #18181C 极低饱和背景点阵
COLOR_SURFACE_1 = (18, 18, 22)      # #121216 一级面板背景
COLOR_BORDER_1 = (40, 40, 46)       # #28282E 一级面板边框 (1px 细线)
COLOR_SURFACE_2 = (24, 24, 30)      # #18181E 二级卡片背景
COLOR_BORDER_2 = (48, 48, 56)       # #303038 二级卡片边框 (无左边框)
COLOR_SURFACE_TAG = (34, 20, 12)    # #22140C 橙色标签暗底
COLOR_BORDER_TAG = (120, 45, 15)    # #782D0F 橙色标签微边

# 橙色色系（工业暖光、稳重坚硬，摒弃刺眼霓虹感）
ORANGE_PRIMARY = (249, 115, 22)     # #F97316 主工业橙
ORANGE_BRIGHT = (251, 146, 60)      # #FB923C 高亮琥珀橙
ORANGE_DEEP = (194, 65, 12)         # #C2410C 沉稳暗橙
ORANGE_MUTED = (154, 52, 18)        # #9A3412 辅助暗刻度

# 文本色系 (严格排版层级)
TEXT_TITLE = (250, 250, 250)        # #FAFAFA 纯白高亮标题
TEXT_SUB = (212, 212, 216)          # #D4D4D8 浅灰主正文
TEXT_BODY = (161, 161, 170)         # #A1A1AA 辅助正文
TEXT_MUTED = (113, 113, 122)        # #71717A 细微标注/注释


def load_font(size, bold=False):
    """按优先级加载中英文兼备的高质量系统字体"""
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size, index=0)
            except Exception:
                continue
    return ImageFont.load_default()


font_title = load_font(26, bold=True)
font_subtitle = load_font(13)
font_h2 = load_font(16, bold=True)
font_h3 = load_font(14, bold=True)
font_body = load_font(12)
font_body_bold = load_font(12, bold=True)
font_sm = load_font(11)
font_code = load_font(11, bold=True)


def draw_grid_background(draw):
    """绘制微弱的精密工业点阵网格"""
    for x in range(20, WIDTH, 32):
        for y in range(20, HEIGHT, 32):
            draw.point((x, y), fill=COLOR_GRID)


def draw_panel(draw, x, y, w, h, title, tag_text):
    """绘制一级外层面板（无任何左侧彩条，四周边框 1px 细线，纯正硬核结构）"""
    draw.rounded_rectangle([x, y, x + w, y + h], radius=8, fill=COLOR_SURFACE_1, outline=COLOR_BORDER_1, width=1)
    
    # 标题左侧极小橙色指示灯点
    draw.ellipse([x + 20, y + 20, x + 26, y + 26], fill=ORANGE_PRIMARY)
    draw.text((x + 36, y + 16), title, fill=TEXT_TITLE, font=font_h2)
    
    # 右侧技术规格 Tag
    if tag_text:
        tw = len(tag_text) * 7 + 16
        tx2 = x + w - 20
        tx1 = tx2 - tw
        draw.rounded_rectangle([tx1, y + 14, tx2, y + 34], radius=4, fill=COLOR_SURFACE_TAG, outline=COLOR_BORDER_TAG, width=1)
        draw.text((tx1 + 8, y + 17), tag_text, fill=ORANGE_BRIGHT, font=font_sm)


def draw_subcard(draw, x, y, w, h, title, items, subtitle=None):
    """
    绘制二级卡片 (严禁使用左侧粗彩条！采用纯粹微边框 + 精致排版)
    """
    draw.rounded_rectangle([x, y, x + w, y + h], radius=6, fill=COLOR_SURFACE_2, outline=COLOR_BORDER_2, width=1)
    
    # 卡片顶部微型标题
    draw.text((x + 16, y + 14), title, fill=TEXT_SUB, font=font_h3)
    
    start_y = y + 36
    if subtitle:
        draw.text((x + 16, y + 33), subtitle, fill=ORANGE_BRIGHT, font=font_sm)
        start_y = y + 54
        
    for idx, item in enumerate(items):
        item_y = start_y + idx * 22
        # 使用精细的高级短线代替低质圆点
        draw.text((x + 16, item_y), "-", fill=ORANGE_PRIMARY, font=font_body_bold)
        draw.text((x + 28, item_y), item, fill=TEXT_BODY, font=font_body)


def render_diagram(lang="zh"):
    img = Image.new("RGB", (WIDTH, HEIGHT), COLOR_BG)
    draw = ImageDraw.Draw(img)
    draw_grid_background(draw)
    
    # ---------------------------------------------------------
    # 语言字典定义
    # ---------------------------------------------------------
    if lang == "zh":
        t = {
            "header_title": "TeamCodex 系统架构全景",
            "header_desc": "无侵入 CDP 注入层与零第三方依赖原生 Node.js SSE 协同中枢",
            "badge_version": "v1.0.2  •  原生 Node.js 18+  •  生产环境就绪",
            
            "panel_client": "客户端运行时与注入层",
            "tag_client": "CDP: 9222",
            
            "sub_client_host": "桌面宿主客户端",
            "sub_client_host_items": [
                "OpenAI Codex / ChatGPT 官方原生桌面客户端",
                "启动时自动绑定 9222 远程调试探测端口",
                "不对客户端二进制或本地配置产生任何侵入修改",
            ],
            
            "sub_inject_engine": "无侵入挂载注入 (sidebar_fullscreen.js)",
            "sub_inject_engine_items": [
                "无缝挂载于原生侧边栏，支持全屏协作工作区切换",
                "Web Component 与 Shadow DOM 严格样式沙箱隔离",
                "单选高亮互斥逻辑：切回历史对话 100% 恢复原生高亮",
            ],
            
            "sub_state_machine": "状态机与协同协议解析",
            "sub_state_machine_items": [
                "智能协同口令解析 (Smart Token: Hub | Room | Key)",
                "对话会话脱敏引擎：剔除私有绝对路径与 Shell 命令",
                "跨端设备类型自动感知 (Mac 宿主 / Windows 虚拟机)",
            ],
            
            "channel_title": "双向通信",
            "channel_post": "HTTP 变更",
            "channel_post_sub": "POST (JSON)",
            "channel_sse": "实时流推",
            "channel_sse_sub": "SSE (Push)",
            
            "panel_hub": "TeamCodex 协同中枢引擎 (server/dev_host.mjs)",
            "tag_hub": "端口: 18765",
            
            "hub_card_auth": "房间隔离与动态鉴权",
            "hub_card_auth_items": [
                "多房间完全逻辑隔离与口令哈希校验",
                "401 鉴权失效自动恢复与密钥自动携带",
                "基于客户端 Message ID 的幂等防重机制",
            ],
            
            "hub_card_sse": "原生实时 SSE 事件总线",
            "hub_card_sse_items": [
                "纯原生 Node.js HTTP Streaming，零外部依赖",
                "冷启动延迟 < 15ms，轻量常驻极低内存占用",
                "广播事件：会话快照入库、协同消息增量实时触达",
            ],
            
            "hub_card_presence": "多端在线感知与去重",
            "hub_card_presence_items": [
                "智能识别 Mac 宿主与 Windows 虚拟机网络拓扑",
                "同一开发人员多设备在线人数动态合并去重",
                "心跳保活检测与幽灵失联节点平滑回收",
            ],
            
            "hub_card_storage": "上下文存储与快照归档",
            "hub_card_storage_items": [
                "原子化磁盘刷新存储 (data/messages.json)",
                "脱敏快照结构化归档与一键导入当前对话",
                "共享通道服务发现机制 (hub_discovery.json)",
            ],
            
            "banner_metrics_title": "架构工程特性指标",
            "banner_metrics_1": "• 15ms 冷启动延迟   • 零第三方 npm 依赖 (纯原生 Node.js 标准库)   • 内存事件总线与原子持久化",
            "banner_metrics_2": "• 私有化离线闭环，零云端遥测   • Nginx 反代配置必须声明 proxy_buffering off 保证流式畅通",
            
            "panel_topo": "三级网络拓扑与部署模型",
            "tag_topo": "网络拓扑",
            
            "topo_1_title": "模式 1: 本地跨端开发",
            "topo_1_sub": "Mac 宿主 + Windows 虚拟机 (Parallels / VMware)",
            "topo_1_items": [
                "Mac 端后台静默启动协同中枢 (18765)",
                "Windows 虚拟机自动探测宿主机 IP (10.211.55.2)",
                "零手动配置，虚拟机双击即用",
            ],
            
            "topo_2_title": "模式 2: 团队局域网协同",
            "topo_2_sub": "办公室内常开开发机 / Mac mini / NAS",
            "topo_2_items": [
                "运行 deploy-hub.sh 部署或直接拉起中枢",
                "同一局域网/Wi-Fi 客户端填入内网 IP 直连",
                "适合 5 ~ 30 人研发小组安全协作",
            ],
            
            "topo_3_title": "模式 3: 私有云 VPS 部署",
            "topo_3_sub": "Linux 云主机 (Docker Compose / Systemd)",
            "topo_3_items": [
                "一键 Docker 镜像拉起，绑定独立域名",
                "Nginx HTTPS 反代，关闭缓存保持 SSE 流式推送",
                "支持分布式远程办公团队全球接入",
            ],
        }
    else:
        t = {
            "header_title": "TeamCodex System Architecture",
            "header_desc": "Non-intrusive CDP Injection Layer & Zero-dependency Native Node.js SSE Hub",
            "badge_version": "v1.0.2  •  Native Node.js 18+  •  Production Ready",
            
            "panel_client": "Client Runtime & Injection Layer",
            "tag_client": "CDP: 9222",
            
            "sub_client_host": "Desktop Host Client",
            "sub_client_host_items": [
                "OpenAI Codex / ChatGPT Official Desktop App",
                "Auto-attaches CDP remote debugging on port 9222",
                "Zero modifications to binary or local configurations",
            ],
            
            "sub_inject_engine": "CDP Mounting Engine (sidebar_fullscreen.js)",
            "sub_inject_engine_items": [
                "Seamlessly embedded in native sidebar; fullscreen workspace toggle",
                "Shadow DOM & Web Components for strict CSS isolation",
                "Single-selection mutual exclusion: native state restored on exit",
            ],
            
            "sub_state_machine": "State Machine & Smart Token Parser",
            "sub_state_machine_items": [
                "Instant Smart Token resolution (Hub | Room | Key)",
                "Sanitization engine: purges private filepaths and shell history",
                "Auto-detects device identity (Mac Host vs Windows VM)",
            ],
            
            "channel_title": "Channels",
            "channel_post": "HTTP REST",
            "channel_post_sub": "POST (JSON)",
            "channel_sse": "Event Stream",
            "channel_sse_sub": "SSE (Push)",
            
            "panel_hub": "TeamCodex Hub Core Engine (server/dev_host.mjs)",
            "tag_hub": "Port: 18765",
            
            "hub_card_auth": "Room Isolation & Security Gates",
            "hub_card_auth_items": [
                "Dynamic room partitioning with SHA hash verification",
                "401 Unauthorized self-healing and auto key carryover",
                "Client Message ID idempotency and duplicate elimination",
            ],
            
            "hub_card_sse": "Native Real-time SSE Event Bus",
            "hub_card_sse_items": [
                "Pure Node.js standard HTTP streaming, zero external npm packages",
                "Cold-start latency < 15ms with negligible memory footprint",
                "Real-time event broadcasting: thread snapshots, instant chats",
            ],
            
            "hub_card_presence": "Presence & Device Identification",
            "hub_card_presence_items": [
                "Topology inspection for Mac Host vs Windows VM nodes",
                "Dynamic active user deduplication across multi-device sessions",
                "Heartbeat monitoring and graceful ghost-node reclamation",
            ],
            
            "hub_card_storage": "Context Storage & Snapshot Relays",
            "hub_card_storage_items": [
                "Atomic disk serialization to data/messages.json",
                "Privacy-safe snapshot archiving with one-click thread injection",
                "Shared cross-process hub discovery channel (hub_discovery.json)",
            ],
            
            "banner_metrics_title": "Architectural Highlights & Engineering Metrics",
            "banner_metrics_1": "• 15ms cold-start latency   • Zero npm dependencies (Pure Node.js standard library)   • In-memory event bus",
            "banner_metrics_2": "• Air-gapped privacy: zero external telemetry   • Nginx reverse proxy requires proxy_buffering off",
            
            "panel_topo": "Three-Tier Deployment Topology Models",
            "tag_topo": "Topology",
            
            "topo_1_title": "Model 1: Local Cross-OS",
            "topo_1_sub": "Mac Host + Windows VM (Parallels / VMware)",
            "topo_1_items": [
                "Mac background spawns Hub silently on port 18765",
                "Windows VM auto-probes host bridge IP (10.211.55.2)",
                "Zero manual setup: works immediately inside VM",
            ],
            
            "topo_2_title": "Model 2: Private LAN Collab",
            "topo_2_sub": "Dedicated Office PC / Mac mini / Local NAS",
            "topo_2_items": [
                "Deploy via deploy-hub.sh or direct node execution",
                "Team joins via LAN IP or single-line Smart Token",
                "Tailored for 5 ~ 30 engineer co-located squads",
            ],
            
            "topo_3_title": "Model 3: Cloud VPS Deployment",
            "topo_3_sub": "Linux Cloud Instance (Docker / Systemd)",
            "topo_3_items": [
                "Production container setup with custom domain name",
                "Nginx reverse proxy with unbuffered SSE stream streaming",
                "Global access for distributed remote engineering teams",
            ],
        }

    # ---------------------------------------------------------
    # 1. 顶部 Header (硬核标题 + 状态胶囊)
    # ---------------------------------------------------------
    draw.text((60, 38), t["header_title"], fill=TEXT_TITLE, font=font_title)
    draw.text((60, 76), t["header_desc"], fill=TEXT_BODY, font=font_subtitle)
    
    # 顶部右侧参数小胶囊
    badge_w = 340
    badge_x = WIDTH - 60 - badge_w
    draw.rounded_rectangle([badge_x, 42, badge_x + badge_w, 74], radius=4, fill=COLOR_SURFACE_TAG, outline=COLOR_BORDER_TAG, width=1)
    draw.text((badge_x + 16, 50), t["badge_version"], fill=ORANGE_BRIGHT, font=font_code)
    
    # ---------------------------------------------------------
    # 2. 上半区：客户端运行时 (Client Layer)
    # ---------------------------------------------------------
    client_x, client_y, client_w, client_h = 60, 110, 445, 500
    draw_panel(draw, client_x, client_y, client_w, client_h, t["panel_client"], t["tag_client"])
    
    draw_subcard(draw, client_x + 18, client_y + 55, client_w - 36, 125, t["sub_client_host"], t["sub_client_host_items"])
    draw_subcard(draw, client_x + 18, client_y + 195, client_w - 36, 135, t["sub_inject_engine"], t["sub_inject_engine_items"])
    draw_subcard(draw, client_x + 18, client_y + 345, client_w - 36, 135, t["sub_state_machine"], t["sub_state_machine_items"])
    
    # ---------------------------------------------------------
    # 3. 中间通信管道 (Bi-directional Bus)
    # ---------------------------------------------------------
    bus_x, bus_y, bus_w, bus_h = 518, 230, 92, 250
    draw.rounded_rectangle([bus_x, bus_y, bus_x + bus_w, bus_y + bus_h], radius=6, fill=COLOR_SURFACE_1, outline=COLOR_BORDER_1, width=1)
    
    # 管道小标题
    draw.text((bus_x + 18, bus_y + 16), t["channel_title"], fill=TEXT_MUTED, font=font_sm)
    
    # 上行 POST
    draw.text((bus_x + 14, bus_y + 50), t["channel_post"], fill=TEXT_SUB, font=font_body_bold)
    draw.text((bus_x + 14, bus_y + 70), t["channel_post_sub"], fill=ORANGE_BRIGHT, font=font_code)
    draw.text((bus_x + 36, bus_y + 92), "==>>", fill=ORANGE_PRIMARY, font=font_h3)
    
    # 分界线
    draw.line([bus_x + 15, bus_y + 125, bus_x + bus_w - 15, bus_y + 125], fill=COLOR_BORDER_2, width=1)
    
    # 下行 SSE
    draw.text((bus_x + 14, bus_y + 145), t["channel_sse"], fill=TEXT_SUB, font=font_body_bold)
    draw.text((bus_x + 14, bus_y + 165), t["channel_sse_sub"], fill=ORANGE_BRIGHT, font=font_code)
    draw.text((bus_x + 36, bus_y + 187), "<<==", fill=ORANGE_PRIMARY, font=font_h3)
    
    # ---------------------------------------------------------
    # 4. 上半区：协同中枢 (Hub Core Engine)
    # ---------------------------------------------------------
    hub_x, hub_y, hub_w, hub_h = 625, 110, 915, 500
    draw_panel(draw, hub_x, hub_y, hub_w, hub_h, t["panel_hub"], t["tag_hub"])
    
    card_w = 425
    card_h = 135
    row1_y = hub_y + 55
    row2_y = hub_y + 205
    col1_x = hub_x + 20
    col2_x = hub_x + 470
    
    draw_subcard(draw, col1_x, row1_y, card_w, card_h, t["hub_card_auth"], t["hub_card_auth_items"])
    draw_subcard(draw, col2_x, row1_y, card_w, card_h, t["hub_card_sse"], t["hub_card_sse_items"])
    draw_subcard(draw, col1_x, row2_y, card_w, card_h, t["hub_card_presence"], t["hub_card_presence_items"])
    draw_subcard(draw, col2_x, row2_y, card_w, card_h, t["hub_card_storage"], t["hub_card_storage_items"])
    
    # 底部核心指标栏 (Hub Bottom Banner)
    metrics_y = hub_y + 355
    metrics_w = hub_w - 40
    draw.rounded_rectangle([col1_x, metrics_y, col1_x + metrics_w, metrics_y + 125], radius=6, fill=COLOR_SURFACE_2, outline=COLOR_BORDER_2, width=1)
    
    draw.ellipse([col1_x + 18, metrics_y + 18, col1_x + 24, metrics_y + 24], fill=ORANGE_PRIMARY)
    draw.text((col1_x + 34, metrics_y + 14), t["banner_metrics_title"], fill=TEXT_TITLE, font=font_h3)
    
    draw.text((col1_x + 20, metrics_y + 48), t["banner_metrics_1"], fill=TEXT_SUB, font=font_body)
    draw.text((col1_x + 20, metrics_y + 78), t["banner_metrics_2"], fill=TEXT_MUTED, font=font_sm)
    
    # ---------------------------------------------------------
    # 5. 下半区：三级部署拓扑矩阵 (Deployment Topologies)
    # ---------------------------------------------------------
    topo_x, topo_y, topo_w, topo_h = 60, 630, 1480, 290
    draw_panel(draw, topo_x, topo_y, topo_w, topo_h, t["panel_topo"], t["tag_topo"])
    
    tcard_w = 460
    tcard_h = 205
    tcard_y = topo_y + 55
    
    draw_subcard(draw, topo_x + 20, tcard_y, tcard_w, tcard_h, t["topo_1_title"], t["topo_1_items"], subtitle=t["topo_1_sub"])
    draw_subcard(draw, topo_x + 510, tcard_y, tcard_w, tcard_h, t["topo_2_title"], t["topo_2_items"], subtitle=t["topo_2_sub"])
    draw_subcard(draw, topo_x + 1000, tcard_y, tcard_w, tcard_h, t["topo_3_title"], t["topo_3_items"], subtitle=t["topo_3_sub"])
    
    return img


def main():
    # 生成中文架构图
    img_zh = render_diagram("zh")
    zh_path = os.path.join(ASSETS_DIR, "architecture_zh.png")
    img_zh.save(zh_path, format="PNG", optimize=True)
    print(f"[SUCCESS] 中文架构图已生成: {zh_path} ({os.path.getsize(zh_path)} 字节)")

    # 生成英文架构图
    img_en = render_diagram("en")
    en_path = os.path.join(ASSETS_DIR, "architecture_en.png")
    img_en.save(en_path, format="PNG", optimize=True)
    print(f"[SUCCESS] 英文架构图已生成: {en_path} ({os.path.getsize(en_path)} 字节)")

    # 默认架构图同步为中文版本
    default_path = os.path.join(ASSETS_DIR, "architecture.png")
    img_zh.save(default_path, format="PNG", optimize=True)
    print(f"[SUCCESS] 默认架构图已同步: {default_path} ({os.path.getsize(default_path)} 字节)")


if __name__ == "__main__":
    main()

