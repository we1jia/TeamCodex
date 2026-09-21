#!/usr/bin/env python3
"""分层技术图解版本，沿用独立 Chrome 渲染器，不覆盖旧图。"""
from html import escape
from generate_architecture_diagram import ASSETS, chrome_binary, render

INK = "#252627"
GRAY = "#737575"
ORANGE = "#bb622d"


def text(x, y, value, size=22, color=INK, weight=400, mono=False):
    family = 'Menlo, monospace' if mono else 'Helvetica Neue, PingFang SC, sans-serif'
    return f'<text x="{x}" y="{y}" fill="{color}" font-family="{family}" font-size="{size}" font-weight="{weight}">{escape(value)}</text>'


def rect(x, y, w, h, fill="#fff", stroke="#d7d8d5", radius=10, dashed=False):
    dash = 'stroke-dasharray="6 6"' if dashed else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="1.4" {dash}/>'


def line(points, color=GRAY, arrow=False):
    marker = f'marker-end="url(#{"orange" if color == ORANGE else "gray"})"' if arrow else ''
    return f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="1.8" {marker}/>'


def icon(x, y, kind):
    shapes = {
        "desktop": '<rect x="0" y="0" width="34" height="24" rx="3"/><path d="M17 24v8M7 32h20"/>',
        "room": '<rect width="27" height="26" rx="3"/><path d="M8 8h11M8 15h7M33 7v25H7"/>',
        "chat": '<path d="M2 2h31v23H13L5 32v-7H2z"/><path d="M9 10h17M9 17h11"/>',
        "board": '<rect width="34" height="30" rx="3"/><path d="M11 0v30M23 0v30M4 8h3M15 8h4M27 8h3M4 15h3M15 15h4"/>',
        "store": '<ellipse cx="18" cy="5" rx="17" ry="5"/><path d="M1 5v22c0 7 34 7 34 0V5M1 16c0 7 34 7 34 0"/>',
    }
    return f'<g transform="translate({x} {y})" fill="none" stroke="{GRAY}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{shapes[kind]}</g>'


def client(y, title, system):
    return ''.join([
        rect(60, y, 340, 185), icon(84, y+25, "desktop"),
        text(137, y+47, title, 25, weight=500), text(137, y+76, system, 19, GRAY),
        line(f"84,{y+98} 376,{y+98}", "#e6e6e2"),
        text(84, y+132, "Codex / ChatGPT", 23),
        text(84, y+165, "Team 工作区 · 分享 / 讨论 / 导入", 19, GRAY),
    ])


def diagram():
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1120" viewBox="0 0 1600 1120">',
             '<title>TeamCodex 组件架构与协作数据流</title>',
             '<defs><marker id="gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="#737575"/></marker><marker id="orange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="#bb622d"/></marker></defs>',
             rect(0, 0, 1600, 1120, "#fbfbf8", "none", 0),
             text(60, 62, "TEAMCODEX", 19, ORANGE, 500), text(1210, 62, "SYSTEM OVERVIEW / 01", 17, GRAY, mono=True),
             text(60, 120, "团队上下文，如何在独立会话之间流转", 34, weight=500),
             text(60, 162, "桌面端保持独立；共享内容经由同一个 Hub 保存、推送，再由成员选择导入。", 22, GRAY),
             line("60,190 1540,190", "#d7d8d5"),
             text(60, 232, "01   桌面客户端", 22, weight=500),
             text(560, 232, "02   协作中枢", 22, weight=500),
             text(1240, 232, "03   数据存储", 22, weight=500),
             client(262, "成员 A", "macOS / Windows"), client(486, "成员 B / 更多成员", "macOS / Windows"),
             rect(560, 262, 540, 457, "#f5f4ef", "#bfc1b9", 12, True),
             text(588, 306, "TeamCodex Hub", 28, weight=500), text(865, 306, "Node.js :18765", 18, GRAY, mono=True),
             rect(584, 329, 492, 72, "#f9eee1", "#d6b592", 8), icon(604, 349, "room"),
             text(657, 359, "房间与访问控制", 23, weight=500), text(657, 387, "房间口令 · 成员权限", 18, GRAY),
             rect(584, 420, 237, 167), icon(602, 439, "chat"),
             text(602, 506, "消息与上下文", 23, weight=500), text(602, 539, "讨论 · 会话快照", 20, GRAY), text(602, 569, "摘要 · 在线状态", 20, GRAY),
             rect(839, 420, 237, 167), icon(857, 439, "board"),
             text(857, 506, "团队工作区", 23, weight=500), text(857, 539, "看板 · 知识库", 20, GRAY), text(857, 569, "素材 · 工作日历", 20, GRAY),
             rect(584, 610, 492, 79, "#ffffff", "#d7d8d5", 8),
             text(604, 642, "SSE 事件推送", 23, ORANGE, 500), text(604, 673, "向同房间客户端分发更新", 20, GRAY),
             rect(1240, 332, 300, 286), icon(1265, 355, "store"), text(1318, 380, "Hub 本地存储", 23, weight=500),
             line("1265,406 1515,406", "#e2e2dc"),
             text(1265, 444, "消息 / 会话快照", 21), text(1265, 474, "messages.json", 17, GRAY, mono=True),
             text(1265, 516, "工作区 / 上传文件", 21), text(1265, 546, "workspace.json", 17, GRAY, mono=True), text(1265, 579, "uploads/ · blobs", 17, GRAY, mono=True),
             line("1100,447 1232,447", GRAY, True), text(1132, 432, "保存", 20, GRAY),
             line("1240,540 1108,540", GRAY, True), text(1132, 525, "读取", 20, GRAY),
    ]
    for y in (326, 550):
        parts += [line(f"400,{y} 552,{y}", GRAY, True), text(422, y-15, "HTTP 请求", 18, GRAY),
                  line(f"560,{y+76} 408,{y+76}", ORANGE, True), text(428, y+61, "SSE 更新", 18, ORANGE)]
    parts += [
        text(60, 764, "接入与部署", 20, GRAY), line("196,757 1540,757", "#deded7"),
        rect(60, 787, 460, 151), text(84, 824, "本机挂载", 23, weight=500),
        text(84, 860, "伴侣程序 → CDP → Team 工作区", 21), text(84, 899, "CDP 负责本机 UI 挂载，不承担跨机同步。", 19, GRAY),
        rect(540, 787, 500, 151), text(564, 824, "Codex 插件入口", 23, weight=500),
        text(564, 860, "Skills / Hook → Hub 摘要 → 当前任务", 21), text(564, 899, "可选上下文入口，与可见侧栏分开。", 19, GRAY),
        rect(1060, 787, 480, 151), text(1084, 824, "同一套 Hub，三种部署位置", 23, weight=500),
        text(1084, 860, "本机 / 虚拟机 · 团队局域网 · 私有云", 21), text(1084, 899, "客户端连接同一中枢，无需合并各自会话。", 19, GRAY),
        line("60,982 1540,982", "#d7d8d5"),
        text(60, 1031, "一次上下文接力", 23, weight=500),
        text(350, 1031, "1  分享所选会话", 23), line("552,1024 629,1024", GRAY, True),
        text(657, 1031, "2  Hub 保存并推送", 23), line("894,1024 972,1024", GRAY, True),
        text(1000, 1031, "3  成员选择并导入", 23),
        text(60, 1080, "推送更新 ≠ 自动导入全部团队对话", 18, GRAY), '</svg>',
    ]
    return ''.join(parts)


if __name__ == '__main__':
    svg = diagram()
    source = ASSETS / 'architecture_editorial_zh.svg'
    output = ASSETS / 'architecture_editorial_zh.png'
    source.write_text(svg, encoding='utf-8')
    render(chrome_binary(), svg, output)
    print(output)
