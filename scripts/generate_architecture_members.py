#!/usr/bin/env python3
"""保留浅色技术文档风格，明确成员各自的会话边界与共享房间，支持中英文双语。"""
import shutil
from generate_architecture_diagram import ASSETS, chrome_binary, render
from generate_architecture_editorial import text, rect, line
from generate_architecture_comparisons import start

INK, GRAY, BLUE = '#263c55', '#647184', '#315a85'


def member(x, name, device_info, session, note, action, companion_text, zh=True):
    share_label = '分享' if zh else 'Share'
    import_label = '导入' if zh else 'Import'
    team_ws_title = 'Team 工作区' if zh else 'Team Workspace'
    share_x = x + 25 if zh else x + 20
    import_x = x + 268 if zh else x + 264

    return ''.join([
        rect(x, 234, 370, 500, '#eef2f6', 'none', 8),
        text(x+24, 278, name, 28, INK, 500),
        text(x+24, 314, device_info, 19 if not zh else 20, GRAY),
        rect(x+22, 340, 326, 144, '#ffffff', '#cbd2dc', 6),
        text(x+44, 377, 'Codex / ChatGPT', 24, INK, 500),
        text(x+44, 415, session, 21 if not zh else 23, INK),
        text(x+44, 453, note, 17 if not zh else 18, GRAY),
        line(f'{x+116},489 {x+116},543', '#909aab', True),
        text(share_x, 522, share_label, 18, BLUE),
        line(f'{x+252},548 {x+252},494', '#909aab', True),
        text(import_x, 522, import_label, 18, BLUE),
        rect(x+22, 553, 326, 118, '#ffffff', '#cbd2dc', 6),
        text(x+44, 591, team_ws_title, 24, INK, 500),
        text(x+44, 632, action, 20 if not zh else 21, GRAY),
        text(x+24, 709, companion_text, 18 if not zh else 20, BLUE),
    ])


def diagram(zh=True):
    p = start('#f8fafc')
    
    brand = 'TEAMCODEX'
    tag = 'MEMBER RELATIONSHIPS'
    title = '独立会话，共享房间，双向协作' if zh else 'Separate Sessions, Shared Room, Two-Way Collaboration'
    subtitle = (
        '成员通过同一个 Hub 交换已分享的内容；每个人决定把哪些内容导入自己的 AI 会话。'
        if zh else
        'Members exchange shared content through a common Hub; each person decides what to import into their own AI session.'
    )

    p += [
        text(60, 63, brand, 18, BLUE, 500),
        text(1180, 63, tag, 17, GRAY, mono=True),
        text(60, 121, title, 35 if not zh else 37, INK, 500),
        text(60, 169, subtitle, 20 if not zh else 22, GRAY),
    ]

    if zh:
        p += [
            member(60, '成员 A', '自己的电脑 · macOS / Windows', 'A 的独立 AI 会话', '未分享的会话不因入房间而同步', '分享快照 · 讨论 · 选择导入', '本机伴侣 → CDP 挂载工作区', zh=True),
            member(1170, '成员 B', '自己的电脑 · macOS / Windows', 'B 的独立 AI 会话', '未分享的会话不因入房间而同步', '接收更新 · 讨论 · 选择导入', '本机伴侣 → CDP 挂载工作区', zh=True),
        ]
    else:
        p += [
            member(60, 'Member A', 'Personal Device · macOS / Windows', "A's Isolated AI Session", 'Unshared chats remain strictly local', 'Share snapshot · Discuss · Import', 'Companion App → Mounts via CDP', zh=False),
            member(1170, 'Member B', 'Personal Device · macOS / Windows', "B's Isolated AI Session", 'Unshared chats remain strictly local', 'Receive updates · Discuss · Import', 'Companion App → Mounts via CDP', zh=False),
        ]

    # Hub Central Card
    hub_title = 'TeamCodex Hub'
    hub_tech = 'Node.js · 18765'
    room_title = '同一个团队房间' if zh else 'Same Team Room'
    room_auth = '房间口令 / 成员权限' if zh else 'Room Key / Member Access'
    item1 = '共享消息与会话快照' if zh else 'Shared messages & snapshots'
    item2 = '成员在线状态' if zh else 'Member presence & status'
    item3 = '任务看板 / 知识库' if zh else 'Task board / Knowledge base'
    item4 = '素材库 / 工作日历' if zh else 'Asset library / Calendar'
    more_item = '更多成员以相同方式接入' if zh else 'More members connect identically'
    hub_footer = '同房间、按权限共享内容' if zh else 'Shared in room by permissions'

    p += [
        rect(620, 234, 360, 500, '#eef2f6', 'none', 8),
        text(644, 278, hub_title, 28, INK, 500),
        text(644, 314, hub_tech, 20, GRAY),
        rect(642, 340, 316, 331, '#ffffff', '#aabed1', 6),
        text(665, 380, room_title, 25, BLUE, 500),
        text(665, 418, room_auth, 20 if not zh else 21, GRAY),
        line('665,444 936,444', '#d4dce5'),
        text(665, 482, item1, 21 if not zh else 22, INK),
        text(665, 520, item2, 21 if not zh else 22, INK),
        text(665, 558, item3, 21 if not zh else 22, INK),
        text(665, 596, item4, 21 if not zh else 22, INK),
        text(665, 641, more_item, 18 if not zh else 19, GRAY),
        text(644, 709, hub_footer, 19 if not zh else 20, BLUE),
    ]

    # HTTP & SSE Arrows
    req_label = 'HTTP 请求' if zh else 'HTTP Request'
    sse_label = 'SSE 更新' if zh else 'SSE Update'
    req_x_offset = 29 if zh else 16
    sse_x_offset = 32 if zh else 23

    for left, right, reverse in [(430, 620, False), (980, 1170, True)]:
        incoming = f'{right},568 {left+8},568' if reverse else f'{left},568 {right-8},568'
        outgoing = f'{left},640 {right-8},640' if reverse else f'{right},640 {left+8},640'
        p += [
            line(incoming, '#909aab', True),
            text(left + req_x_offset, 551, req_label, 19 if not zh else 20, BLUE),
            line(outgoing, '#909aab', True),
            text(left + sse_x_offset, 624, sse_label, 19 if not zh else 20, BLUE),
        ]

    # Three Bottom Feature Cards
    if zh:
        b1_t = '每位成员都能分享，也都能导入'
        b1_d1 = 'A 与 B 是对等协作者，不是固定的发送端和接收端。'
        b1_d2 = '成员间通过 Hub 协作，不直接合并本地会话。'

        b2_t = 'Hub 持久化存储'
        b2_d1 = '消息 / 快照 / 工作区数据 / 上传文件'
        b2_d2 = '可部署在本机、团队局域网或私有云'

        b3_t = '可选：Codex 插件入口'
        b3_d1 = 'Skills / Hook 读取 Hub 摘要'
        b3_d2 = '把摘要带入当前任务，与侧栏入口分开'
    else:
        b1_t = 'Every Member Can Share & Import'
        b1_d1 = 'A and B are peer collaborators, not fixed senders and receivers.'
        b1_d2 = 'Members collaborate via Hub; local sessions never merge directly.'

        b2_t = 'Hub Persistent Storage'
        b2_d1 = 'Messages / snapshots / workspace data / files'
        b2_d2 = 'Deploy locally, on LAN, or on private cloud'

        b3_t = 'Optional: Codex Plugin Entry'
        b3_d1 = 'Skills / Hook read Hub summaries'
        b3_d2 = 'Inject summary into task; separate from sidebar'

    p += [
        rect(60, 782, 490, 129, '#eef2f6', 'none', 6),
        text(84, 819, b1_t, 23 if not zh else 24, INK, 500),
        text(84, 860, b1_d1, 16 if not zh else 18, GRAY),
        text(84, 890, b1_d2, 17 if not zh else 19, GRAY),
        line('800,736 800,775', '#909aab', True),
        rect(580, 782, 460, 129, '#ffffff', '#cbd2dc', 6),
        text(604, 819, b2_t, 23 if not zh else 24, INK, 500),
        text(604, 860, b2_d1, 18 if not zh else 20, GRAY),
        text(604, 890, b2_d2, 18 if not zh else 19, GRAY),
        rect(1070, 782, 470, 129, '#eef2f6', 'none', 6),
        text(1094, 819, b3_t, 23 if not zh else 24, INK, 500),
        text(1094, 860, b3_d1, 18 if not zh else 20, GRAY),
        text(1094, 890, b3_d2, 17 if not zh else 19, GRAY),
        line('60,953 1540,953', '#cbd2dc'),
    ]

    # Flow Walkthrough
    flow_title = '示例 · A 分享，B 接力' if zh else 'Example · A Shares, B Takes Over'
    flow_steps = (
        'A 选择会话并分享   →   Hub 保存并通知同房间成员   →   B 在 Team 查看   →   B 选择并导入自己的会话'
        if zh else
        'A selects & shares chat   →   Hub stores & notifies room   →   B inspects in Team   →   B selects & imports into local chat'
    )
    flow_note = (
        '共享范围：已分享的内容；实时推送不等于自动导入每个成员的 AI 会话。'
        if zh else
        'Scope: Explicitly shared content only. Real-time push does not auto-inject into every member\'s AI session.'
    )

    p += [
        text(60, 997, flow_title, 24, INK, 500),
        text(60, 1041, flow_steps, 21 if not zh else 23, INK),
        text(60, 1084, flow_note, 18 if not zh else 19, GRAY),
        '</svg>',
    ]

    return ''.join(p)


def generate_all():
    # 1. 渲染中文版
    svg_zh = diagram(zh=True)
    svg_zh_file = ASSETS / 'architecture_document_members_zh.svg'
    png_zh_file = ASSETS / 'architecture_document_members_zh.png'
    svg_zh_file.write_text(svg_zh, encoding='utf-8')
    render(chrome_binary(), svg_zh, png_zh_file)
    print(f"Generated: {png_zh_file}")

    # 2. 渲染英文版
    svg_en = diagram(zh=False)
    svg_en_file = ASSETS / 'architecture_document_members_en.svg'
    png_en_file = ASSETS / 'architecture_document_members_en.png'
    svg_en_file.write_text(svg_en, encoding='utf-8')
    render(chrome_binary(), svg_en, png_en_file)
    print(f"Generated: {png_en_file}")

    # 3. 覆盖主架构图
    for src_svg, dest_svg in [
        (svg_zh_file, ASSETS / 'architecture_zh.svg'),
        (svg_en_file, ASSETS / 'architecture_en.svg'),
        (svg_zh_file, ASSETS / 'architecture.svg'),
    ]:
        shutil.copyfile(src_svg, dest_svg)
        print(f"Copied {src_svg.name} -> {dest_svg.name}")

    for src_png, dest_png in [
        (png_zh_file, ASSETS / 'architecture_zh.png'),
        (png_en_file, ASSETS / 'architecture_en.png'),
        (png_zh_file, ASSETS / 'architecture.png'),
    ]:
        shutil.copyfile(src_png, dest_png)
        print(f"Copied {src_png.name} -> {dest_png.name}")


if __name__ == '__main__':
    generate_all()
