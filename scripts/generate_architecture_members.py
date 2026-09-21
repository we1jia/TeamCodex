#!/usr/bin/env python3
"""保留浅色技术文档风格，明确成员各自的会话边界与共享房间。"""
from generate_architecture_diagram import ASSETS, chrome_binary, render
from generate_architecture_editorial import text, rect, line
from generate_architecture_comparisons import start

INK, GRAY, BLUE = '#263c55', '#647184', '#315a85'


def member(x, name, session, action):
    return ''.join([
        rect(x, 234, 370, 500, '#eef2f6', 'none', 8),
        text(x+24, 278, name, 28, INK, 500),
        text(x+24, 314, '自己的电脑 · macOS / Windows', 20, GRAY),
        rect(x+22, 340, 326, 144, '#ffffff', '#cbd2dc', 6),
        text(x+44, 377, 'Codex / ChatGPT', 24, INK, 500),
        text(x+44, 415, session, 23, INK),
        text(x+44, 453, '未分享的会话不因入房间而同步', 18, GRAY),
        line(f'{x+116},489 {x+116},543', '#909aab', True),
        text(x+25, 522, '分享', 18, BLUE),
        line(f'{x+252},548 {x+252},494', '#909aab', True),
        text(x+268, 522, '导入', 18, BLUE),
        rect(x+22, 553, 326, 118, '#ffffff', '#cbd2dc', 6),
        text(x+44, 591, 'Team 工作区', 24, INK, 500),
        text(x+44, 632, action, 21, GRAY),
        text(x+24, 709, '本机伴侣 → CDP 挂载工作区', 20, BLUE),
    ])


def diagram():
    p = start('#f8fafc')
    p += [text(60, 63, 'TEAMCODEX', 18, BLUE, 500),
          text(1180, 63, 'MEMBER RELATIONSHIPS', 17, GRAY, mono=True),
          text(60, 121, '独立会话，共享房间，双向协作', 37, INK, 500),
          text(60, 169, '成员通过同一个 Hub 交换已分享的内容；每个人决定把哪些内容导入自己的 AI 会话。', 22, GRAY),
          member(60, '成员 A', 'A 的独立 AI 会话', '分享快照 · 讨论 · 选择导入'),
          member(1170, '成员 B', 'B 的独立 AI 会话', '接收更新 · 讨论 · 选择导入'),
          rect(620, 234, 360, 500, '#eef2f6', 'none', 8),
          text(644, 278, 'TeamCodex Hub', 28, INK, 500),
          text(644, 314, 'Node.js · 18765', 20, GRAY),
          rect(642, 340, 316, 331, '#ffffff', '#aabed1', 6),
          text(665, 380, '同一个团队房间', 25, BLUE, 500),
          text(665, 418, '房间口令 / 成员权限', 21, GRAY),
          line('665,444 936,444', '#d4dce5'),
          text(665, 482, '共享消息与会话快照', 22, INK),
          text(665, 520, '成员在线状态', 22, INK),
          text(665, 558, '任务看板 / 知识库', 22, INK),
          text(665, 596, '素材库 / 工作日历', 22, INK),
          text(665, 641, '更多成员以相同方式接入', 19, GRAY),
          text(644, 709, '同房间、按权限共享内容', 20, BLUE),
    ]
    # 左右完全对称：客户端提交请求，Hub 返回实时事件。
    for left, right, reverse in [(430, 620, False), (980, 1170, True)]:
        incoming = f'{right},568 {left+8},568' if reverse else f'{left},568 {right-8},568'
        outgoing = f'{left},640 {right-8},640' if reverse else f'{right},640 {left+8},640'
        p += [line(incoming, '#909aab', True), text(left+29, 551, 'HTTP 请求', 20, BLUE),
              line(outgoing, '#909aab', True), text(left+32, 624, 'SSE 更新', 20, BLUE)]
    p += [
        rect(60, 782, 490, 129, '#eef2f6', 'none', 6),
        text(84, 819, '每位成员都能分享，也都能导入', 24, INK, 500),
        text(84, 860, 'A 与 B 是对等协作者，不是固定的发送端和接收端。', 18, GRAY),
        text(84, 890, '成员间通过 Hub 协作，不直接合并本地会话。', 19, GRAY),
        line('800,736 800,775', '#909aab', True),
        rect(580, 782, 460, 129, '#ffffff', '#cbd2dc', 6),
        text(604, 819, 'Hub 持久化存储', 24, INK, 500),
        text(604, 860, '消息 / 快照 / 工作区数据 / 上传文件', 20, GRAY),
        text(604, 890, '可部署在本机、团队局域网或私有云', 19, GRAY),
        rect(1070, 782, 470, 129, '#eef2f6', 'none', 6),
        text(1094, 819, '可选：Codex 插件入口', 24, INK, 500),
        text(1094, 860, 'Skills / Hook 读取 Hub 摘要', 20, GRAY),
        text(1094, 890, '把摘要带入当前任务，与侧栏入口分开', 19, GRAY),
        line('60,953 1540,953', '#cbd2dc'),
        text(60, 997, '示例 · A 分享，B 接力', 24, INK, 500),
        text(60, 1041, 'A 选择会话并分享   →   Hub 保存并通知同房间成员   →   B 在 Team 查看   →   B 选择并导入自己的会话', 23, INK),
        text(60, 1084, '共享范围：已分享的内容；实时推送不等于自动导入每个成员的 AI 会话。', 19, GRAY),
        '</svg>',
    ]
    return ''.join(p)


if __name__ == '__main__':
    svg = diagram()
    (ASSETS / 'architecture_document_members_zh.svg').write_text(svg, encoding='utf-8')
    output = ASSETS / 'architecture_document_members_zh.png'
    render(chrome_binary(), svg, output)
    print(output)
