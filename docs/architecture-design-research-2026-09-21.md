# TeamCodex 架构图视觉调研

日期：2026-09-21。范围：生成历史、字体与图形层级；本轮不替换图片、不推送。

## 结论

当前图的信息流比旧图直接，但较重的字体、较大的箭头和多色面板导致视觉偏演示文稿。建议用技术文档风格重做排版，保留主线，降低字重和图形视觉重量，减少首页图内细节。此为设计判断，不是工具性能结论。

## 已确认事实

| 主张 | 对象 / 版本 | 截至时间 | 支持证据 | 相反或相邻证据 | 证据类型 | 允许措辞 |
|---|---|---|---|---|---|---|
| 早期图由 Pillow 绘制 | TeamCodex 8e25877 | 2026-09-21 | 该提交脚本导入 Image、ImageDraw、ImageFont | 后续已换浏览器渲染 | Git 源码 | 该版本使用 Pillow |
| 截图中的旧图采用 HTML/CSS 与 Chrome 2x | TeamCodex HEAD 4d489aa 的生成脚本 | 同上 | get_html_template、Chrome 截图参数 | 当前工作区已改为 SVG | Git 源码 | 旧脚本采用 HTML/CSS Grid 与 Chrome 2x |
| 当前图使用系统字体栈及较重标题 | 当前工作区脚本 | 同上 | font-family 与 600/650/700 字重、3px 连线、8 单位箭头 marker | 未测实际字形回退 | 当前源码 | 声明字重较重，不宣称已确认字体回退 |
| D2 支持按字重配置字体文件 | D2 Fonts 官方文档 | 同上 | regular、italic、bold、semibold 参数 | 缺失样式会回退；中文实际效果未测 | 官方文档 | 可显式指定各字重字体 |
| C4 推荐带标签的单向关系与图例 | C4 Notation 官方文档 | 同上 | Relationships、Diagram key | 不指定固定配色或绘图工具 | 官方指南 | 借鉴其语义规则，不把蓝灰色当强制样式 |
| IcePanel 强调层级图和消息流 | 官方 Software Architecture Diagramming 页面 | 同上 | Diagram levels、Message flows | 是产品能力说明，本轮未试用 | 来源方主张 | 官网描述了这些能力 |

## 参考候选

评分为本次人工适配评分，不是产品排名：字体与层级 40、README 适配 30、可维护性 30。

| 参考 | 分数 | 用途 | 边界 |
|---|---:|---|---|
| D2 字体与主题 | 90 | 普通标签、代码字体分离；SVG 输出；主题一致性 | 不照搬示例中的微小字号和复杂拓扑 |
| C4 Notation | 85 | 单向关系、协议标注、图例 | 学表达规范，不直接照搬外观 |
| IcePanel 分层思路 | 80 | 总览与细节分开 | 未在账号内创建或验证图 |

## 推荐下一版规格（尚未实施）

- 风格：白 / 极浅灰底，黑灰文字，橙色仅强调 Hub 与关键路径；不继续扩充蓝橙紫多色面板。
- 字体：中文候选 PingFang SC 或 Noto Sans CJK SC；英文候选 Inter 或 Source Sans 3。先核对字体文件和实际字形，再确定。普通标签用 400，模块名用 500–600，不使用合成粗体。
- 代码标签：端口、协议、文件名用独立等宽字体，不与中文标题混排成同一级。
- 比例：以 README 实际约 900–1000px 显示宽度校验；正文最终显示约 14–16px，模块名约 17–20px，标题约 24–28px。不能只检查全分辨率图。
- 图形：显示尺度约 1–1.25px 连线，小箭头，统一低圆角。采用分组边界和留白，不靠厚边框、大标题撑层级。
- 内容：首页保留客户端、Hub、存储和协议；CDP、Hook 与部署细节移至单独技术视图或图注。
- 生成：保持可编辑 SVG / HTML，再导出 PNG；或者采用 D2 后调整主题。D2 不会自动解决中文排版，也没有证据表明换工具即可变好看。
- 验收：中英文分别检查；同时查看原图与 README 缩放尺寸；确认字体加载、文本边界和连接方向。PNG 高清不等于排版验收。

## 仍未确认

实际渲染字体、是否出现中英文字体回退，以及推荐字体的最终组合尚未测量。本轮没有生成替代版本，上一版不能据此称为视觉通过。

## 查询记录与证据边界

- Agent Memory 以 TeamCodex / generate_architecture_diagram / 架构图 / 字体窄查；结果未提供足以单独确认生成实现的证据，因此回到 Git 源码。
- AnySearch 查询 `beautiful software architecture diagrams typography D2 IcePanel design` 与 code.doc / d2 字体主题。
- Agent Reach 网页通道 Jina Reader 核验以下官方来源。
- 一个猜测的 IcePanel 旧文章路径返回 404，已排除，改查已确认的官方产品页；不据此判断该主题没有资料。
- 查看了 D2 官方 Vanilla nitro cola 示例原图，借鉴细线和低字重，而非照搬其配色或信息密度。
- 正反主张核对：PASS。设计判断与官方事实分开；未安装工具、未公开发布、未更新长期记忆。

## 来源

- https://d2lang.com/tour/fonts/
- https://d2lang.com/tour/themes/
- https://d2lang.com/assets/images/theme_3-8deaf0b5ff06edb4b22bbc69613d9bfa.png
- https://c4model.com/diagrams/notation
- https://icepanel.io/software-architecture-diagramming
- 本地 `git show 8e25877:scripts/generate_architecture_diagram.py`
- 本地 `git show 4d489aa:scripts/generate_architecture_diagram.py`
