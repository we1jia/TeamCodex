#!/usr/bin/env python3
"""两种独立视觉演绎；保留原架构图和 README。"""
from generate_architecture_diagram import ASSETS, chrome_binary, render
from generate_architecture_editorial import text, rect, line


def start(background):
    return ['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1120" viewBox="0 0 1600 1120">',
            '<defs><marker id="gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="#909aab"/></marker></defs>',
            rect(0, 0, 1600, 1120, background, 'none', 0)]


def dark_card(x, y, w, title, tag, detail):
    return ''.join([rect(x, y, w, 154, '#20252c', '#454b53', 14),
                    text(x+24, y+32, tag, 16, '#b5a080', mono=True),
                    text(x+24, y+76, title, 26, '#f1f0eb', 500),
                    text(x+24, y+118, detail, 20, '#abb0b7')])


def brand_map():
    p = start('#15191f')
    p += [text(60, 67, 'TEAMCODEX / CONNECTED WORKSPACE', 18, '#d4ab75', mono=True),
          text(60, 134, '各自工作，在同一个空间协作', 38, '#f1f0eb', 500),
          text(60, 179, '桌面会话保持独立，团队上下文通过 Hub 连接。', 23, '#aeb3ba'),
          rect(540, 265, 520, 456, '#24241f', '#a48456', 22),
          text(576, 311, 'SHARED HUB', 17, '#d4ab75', mono=True),
          text(576, 371, 'TeamCodex', 43, '#f1f0eb', 500),
          text(576, 410, 'Node.js · 18765', 21, '#b9b6ab'),
          rect(576, 446, 448, 63, '#303027', '#57513f', 9),
          text(598, 486, '房间口令 / 成员权限', 24, '#ece7da'),
          text(576, 552, '消息 · 快照 · 在线状态', 24, '#ece7da'),
          text(576, 598, '看板 · 知识库 · 素材 · 日历', 24, '#ece7da'),
          text(576, 678, 'HTTP API  /  SSE EVENTS', 18, '#d4ab75', mono=True),
          dark_card(60, 280, 330, '成员 A', 'DESKTOP / macOS', 'Codex / ChatGPT + Team'),
          dark_card(60, 530, 330, '成员 B', 'DESKTOP / WINDOWS', '分享 · 讨论 · 选择导入'),
          dark_card(1210, 280, 330, 'Codex 插件', 'OPTIONAL ENTRY', 'Skills / Hook 读取摘要'),
          dark_card(1210, 530, 330, 'Hub 本地存储', 'PERSISTENCE', '消息 / 工作区 / 上传文件')]
    for y in (330, 580):
        p += [line(f'390,{y} 531,{y}', '#909aab', True), text(414, y-14, 'HTTP 请求', 17, '#abb0b7'),
              line(f'540,{y+67} 399,{y+67}', '#909aab', True), text(418, y+52, 'SSE 更新', 17, '#d4ab75')]
    p += [line('1210,360 1069,360', '#909aab', True), text(1084, 340, '请求摘要', 18, '#abb0b7'),
          line('1060,594 1201,594', '#909aab', True), text(1097, 574, '保存', 18, '#abb0b7'),
          line('1209,655 1069,655', '#909aab', True), text(1097, 638, '读取', 18, '#abb0b7'),
          text(60, 786, 'LOCAL CONNECTION', 16, '#d4ab75', mono=True),
          text(60, 829, '本机伴侣通过 CDP 挂载 Team 工作区；CDP 不用于跨机器同步。', 24, '#c1c4c8'),
          line('60,875 1540,875', '#454b53'),
          text(60, 934, '01', 20, '#d4ab75', mono=True), text(116, 935, '分享所选会话', 27, '#f1f0eb'),
          text(595, 934, '02', 20, '#d4ab75', mono=True), text(651, 935, 'Hub 保存并推送', 27, '#f1f0eb'),
          text(1185, 934, '03', 20, '#d4ab75', mono=True), text(1241, 935, '选择并导入', 27, '#f1f0eb'),
          text(60, 1055, '本机 / 虚拟机     ·     团队局域网     ·     私有云', 21, '#abb0b7'),
          text(1150, 1055, 'BRAND MAP / 02', 18, '#abb0b7', mono=True), '</svg>']
    return ''.join(p)


def document_card(x, y, title, rows, width=300):
    p = [rect(x, y, width, 170, '#ffffff', '#cbd2dc', 5), text(x+22, y+39, title, 25, '#263c55', 500)]
    p += [text(x+22, y+82+i*32, row, 20, '#647184') for i, row in enumerate(rows)]
    return ''.join(p)


def document_map():
    p = start('#f8fafc')
    p += [text(60, 63, 'TEAMCODEX', 18, '#315a85', 500), text(1240, 63, 'ARCHITECTURE / 03', 17, '#647184', mono=True),
          text(60, 125, '系统架构与接入边界', 38, '#263c55', 500),
          text(60, 173, '从用户入口到持久化存储，按职责划分四个层次。', 23, '#647184')]
    columns = [(60, '01', '用户入口'), (440, '02', '接入与传输'), (820, '03', 'Hub 服务'), (1200, '04', '持久化')]
    for x, number, title in columns:
        p += [rect(x, 230, 340, 660, '#eef2f6', 'none', 7),
              text(x+22, 273, number, 19, '#7b8ea4', mono=True), text(x+70, 274, title, 25, '#263c55', 500)]
    p += [document_card(80, 318, '桌面客户端', ['Codex / ChatGPT', '成员 A / B / 更多成员', '各自保留独立会话']),
          document_card(80, 535, 'Team 工作区', ['分享会话快照', '团队讨论 / 看板 / 资料', '选择内容并导入']),
          text(102, 772, '本机伴侣 → CDP 挂载', 22, '#315a85'), text(102, 814, 'CDP 仅用于本机界面', 20, '#647184'),
          document_card(460, 318, 'HTTP API', ['客户端 → Hub', '提交请求 / 分享内容', '读取房间与工作区数据']),
          document_card(460, 535, 'SSE 事件流', ['Hub → 客户端', '推送同房间更新', '消息 / 状态 / 工作区事件']),
          text(482, 772, 'Codex Skills / Hook', 22, '#315a85'), text(482, 814, '读取摘要 → 当前 AI 任务', 20, '#647184'),
          document_card(840, 318, '房间与协作', ['房间口令 / 成员权限', '消息 / 快照 / 摘要', '成员在线状态']),
          document_card(840, 535, '团队工作区', ['任务看板 / 审核', '知识库 / 素材库', '成员工作日历']),
          text(862, 772, 'Node.js · 18765', 22, '#315a85'), text(862, 814, '统一中枢，不合并桌面会话', 20, '#647184'),
          document_card(1220, 318, '结构化数据', ['messages.json', 'workspace.json', '消息 / 快照 / 工作区']),
          document_card(1220, 535, '文件与素材', ['uploads/', 'workspace-blobs/', '位于 Hub 所在机器']),
          text(1242, 772, '可部署到本机或远端', 22, '#315a85'), text(1242, 814, '局域网 / 私有云', 20, '#647184')]
    # 跨栏连接表达请求和推送方向，而非暗示四栏是串行流水线。
    for left, right in [(380, 460), (760, 840)]:
        p += [line(f'{left},403 {right-7},403', '#909aab', True),
              line(f'{right},620 {left+7},620', '#909aab', True)]
    p += [line('1140,403 1213,403', '#909aab', True), line('1220,620 1147,620', '#909aab', True),
          line('60,940 1540,940', '#cbd2dc'),
          text(60, 990, '协作顺序', 23, '#263c55', 500),
          text(252, 990, '分享所选会话   →   Hub 保存并推送   →   成员选择并导入', 26, '#263c55'),
          text(60, 1050, '边界说明：实时更新不会自动将全部团队对话导入每个 AI 会话。', 21, '#647184'), '</svg>']
    return ''.join(p)


if __name__ == '__main__':
    for name, build in [('architecture_brand_map_zh', brand_map), ('architecture_document_map_zh', document_map)]:
        svg = build()
        (ASSETS / f'{name}.svg').write_text(svg, encoding='utf-8')
        output = ASSETS / f'{name}.png'
        render(chrome_binary(), svg, output)
        print(output)
