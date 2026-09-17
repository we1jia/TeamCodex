#!/usr/bin/env python3
"""
生成 TeamCodex 工业级标准系统架构图
输出高质量深色模式 PNG 架构图至 docs/assets/architecture.png
"""

import os
from PIL import Image, ImageDraw, ImageFont

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

WIDTH, HEIGHT = 1600, 960

# 配色规范（现代高级工程暗色系）
BG_COLOR = (11, 15, 25)          # #0b0f19
GRID_COLOR = (22, 30, 46)        # #161e2e
CARD_BG = (17, 24, 39)           # #111827
CARD_BORDER = (31, 41, 55)       # #1f2937
INNER_BG = (24, 33, 53)          # #182135
INNER_BORDER = (45, 55, 72)      # #2d3748

COLOR_BLUE = (59, 130, 246)      # #3b82f6 (CDP / Client)
COLOR_PURPLE = (139, 92, 246)    # #8b5cf6 (Injection / UI)
COLOR_GREEN = (16, 185, 129)     # #10b981 (Hub / Event Bus)
COLOR_AMBER = (245, 158, 11)     # #f59e0b (Security & Auth)
COLOR_CYAN = (6, 182, 212)       # #06b6d4 (Network Topologies)

TEXT_TITLE = (248, 250, 252)     # #f8fafc
TEXT_BODY = (203, 213, 225)      # #cbd5e1
TEXT_MUTED = (148, 163, 184)     # #94a3b8

img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
draw = ImageDraw.Draw(img)

# 绘制背景工程网格点
for x in range(0, WIDTH, 40):
    for y in range(0, HEIGHT, 40):
        draw.point((x, y), fill=GRID_COLOR)

def get_font(size, bold=False):
    candidate_paths = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

font_h1 = get_font(30, bold=True)
font_h2 = get_font(18, bold=True)
font_h3 = get_font(15, bold=True)
font_body = get_font(13)
font_sm = get_font(11)
font_code = get_font(12, bold=True)

# 1. 顶部 Header
draw.text((60, 45), "TeamCodex System Architecture", fill=TEXT_TITLE, font=font_h1)
draw.text((60, 88), "Non-intrusive CDP Injection Layer & Zero-dependency SSE Collaboration Hub", fill=TEXT_MUTED, font=font_body)

# 顶部药丸标签
badge_box = [WIDTH - 360, 48, WIDTH - 60, 80]
draw.rounded_rectangle(badge_box, radius=8, fill=INNER_BG, outline=COLOR_BLUE, width=1)
draw.text((WIDTH - 340, 56), "v1.0.1  •  Production Ready  •  Native Node.js", fill=COLOR_BLUE, font=font_code)

# 绘制卡片辅助函数
def draw_box(x, y, w, h, title, tag, tag_color, border_color=CARD_BORDER, fill_color=CARD_BG):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=10, fill=fill_color, outline=border_color, width=1)
    # 标签
    tw = len(tag) * 8 + 16
    draw.rounded_rectangle([x + w - tw - 16, y + 14, x + w - 16, y + 36], radius=5, fill=INNER_BG, outline=tag_color, width=1)
    draw.text((x + w - tw - 8, y + 18), tag, fill=tag_color, font=font_sm)
    # 标题
    draw.text((x + 20, y + 16), title, fill=TEXT_TITLE, font=font_h2)

def draw_subcard(x, y, w, h, title, items, accent=COLOR_BLUE):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=8, fill=INNER_BG, outline=INNER_BORDER, width=1)
    # 侧边彩条
    draw.rectangle([x, y + 6, x + 4, y + h - 6], fill=accent)
    draw.text((x + 16, y + 12), title, fill=TEXT_TITLE, font=font_h3)
    for idx, it in enumerate(items):
        draw.text((x + 16, y + 36 + idx * 20), "• " + it, fill=TEXT_MUTED, font=font_body)

# -------------------------------------------------------------
# 分区 1: Client Tier (macOS / Windows Desktop)
# -------------------------------------------------------------
draw_box(60, 130, 440, 480, "Client Layer", "CDP 9222", COLOR_BLUE)

draw_subcard(80, 180, 400, 125, "Desktop Host Client", [
    "OpenAI Codex / ChatGPT Native App",
    "CDP Auto-attach Probe on Port 9222",
    "Zero modifications to binary or config",
], COLOR_BLUE)

draw_subcard(80, 325, 400, 135, "Injection Layer (sidebar_fullscreen.js)", [
    "Mounts inside Native Sidebar Container",
    "Web Component & Shadow DOM isolation",
    "Active/Inactive Highlighting Mutex",
    "Seamless Fullscreen Workspace View",
], COLOR_PURPLE)

draw_subcard(80, 480, 400, 110, "State Machine & Token Parser", [
    "Smart Token Parser (Host | Room | Key)",
    "Sanitized Snapshot Ingestion Engine",
    "Node Identity Auto-detect (Mac vs Win)",
], COLOR_AMBER)

# -------------------------------------------------------------
# 中间通信总线通道 (Bus Connectors)
# -------------------------------------------------------------
draw.rounded_rectangle([525, 230, 605, 510], radius=8, fill=INNER_BG, outline=INNER_BORDER, width=1)
draw.text((545, 260), "HTTP", fill=COLOR_BLUE, font=font_code)
draw.text((540, 280), "POST", fill=COLOR_BLUE, font=font_code)
draw.text((550, 310), "-->", fill=COLOR_BLUE, font=font_h3)

draw.text((545, 400), "SSE", fill=COLOR_GREEN, font=font_code)
draw.text((542, 420), "Stream", fill=COLOR_GREEN, font=font_code)
draw.text((550, 450), "<--", fill=COLOR_GREEN, font=font_h3)

# -------------------------------------------------------------
# 分区 2: TeamCodex Hub Core (server/dev_host.mjs)
# -------------------------------------------------------------
draw_box(630, 130, 910, 480, "TeamCodex Hub Engine (dev_host.mjs)", "Port: 18765", COLOR_GREEN)

# 内部 4 个核心架构块
draw_subcard(655, 180, 420, 135, "Multi-Room & Security Gates", [
    "Dynamic Room Isolation & Token Hash Verification",
    "Protected System Space Media Immutability",
    "401 Unauthorized Auto-healing & Key Recovery",
    "Client Idempotent Message ID Deduplication",
], COLOR_AMBER)

draw_subcard(1095, 180, 420, 135, "Real-time SSE Event Bus", [
    "Native Node.js HTTP Streaming Engine",
    "Zero external npm dependencies architecture",
    "Broadcast: snapshot_created, message_added",
    "Dynamic presence heartbeats & latency check",
], COLOR_GREEN)

draw_subcard(655, 335, 420, 135, "Presence & Device Identity", [
    "Automatic Mac Host vs Windows VM Detection",
    "Same-user multi-node deduplication",
    "Peer activity matrix & connection status",
    "Graceful disconnection & ghost node cleanup",
], COLOR_PURPLE)

draw_subcard(1095, 335, 420, 135, "Persistence & Context Storage", [
    "Atomically serialized data/messages.json",
    "Full dialogue thread packaging & scrub",
    "Shell command & private path desensitization",
    "One-click context replay & branch restore",
], COLOR_CYAN)

# Hub 底部性能指示
draw.rounded_rectangle([655, 490, 1515, 595], radius=8, fill=INNER_BG, outline=INNER_BORDER, width=1)
draw.text((680, 510), "Architecture Strengths", fill=TEXT_TITLE, font=font_h3)
draw.text((680, 540), "• 15ms Cold-start latency   • Pure Node.js Standard Library   • In-memory Event Loop with Atomic Disk Flushing   • Zero Cloud Leakage", fill=TEXT_BODY, font=font_body)
draw.text((680, 565), "• Resilient Parallels virtual bridge (10.211.55.x) & LAN auto-discovery   • Unbuffered SSE streaming over reverse proxy", fill=TEXT_MUTED, font=font_sm)

# -------------------------------------------------------------
# 分区 3: Deployment Topologies (底层三种拓扑)
# -------------------------------------------------------------
draw_box(60, 640, 1480, 275, "Deployment Topology Models & Connectivity", "Networking", COLOR_CYAN)

topo_w = 465
topos = [
    ("Model 1: Single-Host Cross-OS", "Mac Host + Windows VM (Parallels)", [
        "Hub spawned silently in macOS background",
        "Windows guest probes 10.211.55.2 automatically",
        "Zero-configuration peer pairing out-of-the-box",
        "Ideal for solo developers on dual-OS setups",
    ], COLOR_BLUE),
    ("Model 2: Private LAN Collab", "Office / Lab Shared Network", [
        "Dedicated PC, Mac Mini, or local NAS in LAN",
        "Run: node server/dev_host.mjs or deploy-hub.sh",
        "Clients join via LAN IP or Smart Token string",
        "Tailored for 5 ~ 30 engineer co-located teams",
    ], COLOR_PURPLE),
    ("Model 3: Public Cloud VPS", "Distributed Remote Engineering", [
        "Linux Cloud Instance (Docker Compose / PM2)",
        "Nginx reverse proxy with SSL / TLS domain",
        "Mandatory: proxy_buffering off for SSE continuity",
        "Accessible globally with room-key security gates",
    ], COLOR_GREEN),
]

for idx, (t_title, t_sub, t_items, t_col) in enumerate(topos):
    tx = 80 + idx * (topo_w + 30)
    ty = 695
    draw.rounded_rectangle([tx, ty, tx + topo_w, ty + 195], radius=8, fill=INNER_BG, outline=INNER_BORDER, width=1)
    draw.rectangle([tx, ty + 6, tx + 4, ty + 195 - 6], fill=t_col)
    draw.text((tx + 16, ty + 12), t_title, fill=TEXT_TITLE, font=font_h3)
    draw.text((tx + 16, ty + 32), t_sub, fill=t_col, font=font_sm)
    for p_idx, pt in enumerate(t_items):
        draw.text((tx + 16, ty + 56 + p_idx * 24), "• " + pt, fill=TEXT_MUTED, font=font_body)

# 确保输出目录存在
out_dir = os.path.join(TC_DIR, "docs", "assets")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "architecture.png")

img.save(out_path, format="PNG", optimize=True)
print(f"[generate_diagram] 架构图已成功生成: {out_path} ({os.path.getsize(out_path)} 字节)")
