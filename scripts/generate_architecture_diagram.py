#!/usr/bin/env python3
"""生成可编辑的双语 SVG 与 README 用 2x PNG；仅使用标准库和独立无头 Chrome。"""

from html import escape
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import time

ASSETS = Path(__file__).resolve().parents[1] / "docs" / "assets"
WIDTH, HEIGHT = 1600, 1120
INK, MUTED = "#172b42", "#52647a"
BLUE, ORANGE, PURPLE = "#2865c7", "#c65323", "#7560a6"


def label(x, y, value, size=24, color=INK, weight=400, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{escape(value)}</text>')


def box(x, y, width, height, fill="#ffffff", stroke="#d4dfeb", radius=22):
    return (f'<rect x="{x}" y="{y}" width="{width}" height="{height}" '
            f'rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')


def arrow(points, color=BLUE, dashed=False):
    dash = ' stroke-dasharray="8 7"' if dashed else ""
    return (f'<polyline points="{points}" fill="none" stroke="{color}" '
            f'stroke-width="3" stroke-linejoin="round"{dash} '
            f'marker-end="url(#{color[1:]})"/>')


def client(x, name, zh):
    text = lambda cn, en: cn if zh else en
    return "".join([
        box(x, 230, 360, 430),
        label(x + 26, 276, name, 28, weight=650),
        label(x + 26, 309, "macOS / Windows", 21, MUTED),
        box(x + 22, 337, 316, 174, "#eef5ff", "#c9daf5", 14),
        label(x + 40, 376, "Codex / ChatGPT", 25, weight=600),
        label(x + 40, 423, "Team 工作区" if zh else "Team workspace", 29, BLUE, 650),
        label(x + 40, 466, text("分享快照 · 讨论 · 导入", "Share · Discuss · Import"), 23, MUTED),
        arrow(f"{x+180},555 {x+180},516", MUTED),
        label(x + 199, 542, "CDP", 18, MUTED),
        label(x + 26, 591, text("本机伴侣 + 注入器", "Companion + injector"), 25, weight=600),
        label(x + 26, 627, text("启动 / 挂载桌面端工作区", "Launch / mount workspace"), 22, MUTED),
    ])


def diagram(zh):
    t = lambda cn, en: cn if zh else en
    colors = [BLUE, ORANGE, PURPLE, MUTED]
    markers = "".join(
        f'<marker id="{c[1:]}" viewBox="0 0 10 10" refX="9" refY="5" '
        f'markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{c}"/></marker>' for c in colors)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img">',
        f'<title>{t("TeamCodex 系统架构与上下文接力", "TeamCodex architecture and context relay")}</title>',
        f'<defs>{markers}</defs>',
        '<g font-family="-apple-system, BlinkMacSystemFont, PingFang SC, Segoe UI, sans-serif">',
        box(0, 0, WIDTH, HEIGHT, "#f6f8fc", "#f6f8fc", 0),
        label(60, 60, "TEAMCODEX  /  ARCHITECTURE", 20, BLUE, 700),
        label(60, 121, t("独立的 AI 会话，共同的团队上下文", "Separate AI sessions. Shared team context."), 43, weight=700),
        label(60, 168, t("通过同一个 Hub 分享、同步和接力；每位成员保留自己的桌面会话。", "Share and synchronize through one Hub. Each member keeps their own desktop session."), 25, MUTED),
        client(60, t("成员 A", "Member A"), zh),
        client(1180, t("成员 B / 更多成员", "Member B / others"), zh),
        box(620, 230, 360, 430, "#fff7ef", "#eab78d"),
        label(649, 279, "TeamCodex Hub", 32, weight=700),
        label(649, 316, "Node.js · :18765", 23, ORANGE),
    ]
    for y, title, detail in [
        (370, t("房间与访问控制", "Rooms & access"), t("房间口令 · 成员权限", "Room keys · member access")),
        (473, t("实时协作", "Live collaboration"), t("消息 · 快照 · 在线状态", "Messages · snapshots · presence")),
        (576, t("团队工作区", "Team workspace"), t("看板 · 知识库 · 素材 · 日历", "Board · docs · assets · calendar")),
    ]:
        parts += [label(649, y, title, 27, weight=650), label(649, y + 36, detail, 20, MUTED)]
    for left, right in [(420, 620), (980, 1180)]:
        center = (left + right) // 2
        inward = f"{left+9},377 {right-9},377" if left == 420 else f"{right-9},377 {left+9},377"
        outward = f"{right-9},476 {left+9},476" if left == 420 else f"{left+9},476 {right-9},476"
        parts += [
            label(center, 334, t("请求 / 分享", "Request / share"), 22, BLUE, 600, "middle"),
            label(center, 359, "HTTP API", 18, MUTED, anchor="middle"), arrow(inward),
            label(center, 432, t("实时更新", "Live updates"), 22, ORANGE, 600, "middle"),
            label(center, 458, "SSE", 18, MUTED, anchor="middle"), arrow(outward, ORANGE),
        ]
    parts += [
        arrow("520,826 557,826 557,618 613,618", PURPLE, True),
        arrow("800,666 800,743", MUTED),
        label(824, 711, t("读写", "Read / write"), 21, MUTED),
        box(60, 750, 460, 180, "#f3effa", "#d9cfea"),
        label(86, 793, t("Codex 插件 · Skills / Hook", "Codex plugin · Skills / Hook"), 26, PURPLE, 650),
        label(86, 834, t("读取 Hub 摘要 → 当前 AI 会话", "Hub summary → active AI session"), 24),
        label(86, 872, "GET /api/compact.txt", 22, MUTED),
        label(86, 909, t("可选入口；侧栏挂载仍由 CDP 完成", "Optional; sidebar mounting uses CDP"), 21, MUTED),
        box(610, 750, 460, 180),
        label(637, 793, t("Hub 所在机器的持久化存储", "Storage on the Hub host"), 27, weight=650),
        label(637, 834, "messages.json · workspace.json", 22, MUTED),
        label(637, 872, "uploads/ · workspace-blobs/", 22, MUTED),
        label(637, 909, t("消息 / 快照 / 工作区数据 / 文件", "Messages / snapshots / workspace / files"), 21, MUTED),
        label(1140, 783, t("一次上下文接力", "A context handoff"), 27, weight=650),
        label(1140, 830, t("01  A 分享所选会话", "01  A shares a session"), 24, BLUE),
        label(1140, 871, t("02  Hub 保存并推送", "02  Hub stores and notifies"), 24, ORANGE),
        label(1140, 912, t("03  B 选择并导入", "03  B selects and imports"), 24, BLUE),
        box(60, 983, 1480, 81, "#eaf0f7", "#eaf0f7", 16),
        label(87, 1033, t("同一套架构，三种 Hub 部署位置", "One architecture, three Hub locations"), 25, weight=600),
        label(680, 1033, t("本机 / 虚拟机", "Local / VM"), 23, MUTED),
        label(966, 1033, t("团队局域网", "Team LAN"), 23, MUTED),
        label(1234, 1033, t("私有云 / VPS", "Private cloud / VPS"), 23, MUTED),
        '</g></svg>',
    ]
    return "".join(parts)


def chrome_binary():
    candidates = [os.environ.get("CHROME_BIN"), shutil.which("google-chrome"),
                  shutil.which("chromium"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise FileNotFoundError("请安装 Chrome / Chromium，或设置 CHROME_BIN。")


def render(chrome, svg, png):
    # 独立临时 profile，不连接或改变用户现有浏览器窗口。
    with tempfile.TemporaryDirectory(prefix="teamcodex-diagram-") as directory:
        page = Path(directory) / "diagram.html"
        page.write_text('<meta charset="utf-8"><style>body{margin:0}svg{display:block}</style>' + svg, encoding="utf-8")
        temporary_png = Path(directory) / "diagram.png"
        command = [
            chrome, "--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
            f"--user-data-dir={directory}/profile", "--force-device-scale-factor=2",
            f"--window-size={WIDTH},{HEIGHT}", f"--screenshot={temporary_png}", page.as_uri(),
        ]
        # 部分 Chrome 版本截图完成后仍驻留；以完整 PNG 尾标记确认落盘。
        with subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as process:
            try:
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if temporary_png.exists() and temporary_png.read_bytes().endswith(b'IEND\xaeB`\x82'):
                        shutil.copyfile(temporary_png, png)
                        break
                    if process.poll() is not None:
                        raise RuntimeError(f"Chrome 提前退出：{process.returncode}")
                    time.sleep(0.1)
                else:
                    raise TimeoutError("Chrome 未在 30 秒内生成完整 PNG")
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    if not png.is_file():
        raise RuntimeError(f"未生成图片：{png}")


def main():
    import generate_architecture_members
    generate_architecture_members.generate_all()


if __name__ == "__main__":
    main()

