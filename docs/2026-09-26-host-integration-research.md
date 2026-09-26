# Team Codex 新版宿主入口调研

截至 2026-09-26（Asia/Shanghai）。范围：官方插件入口与 Mac/Windows 布局适配，不涉及公开发布。

## 已确认事实

1. [插件使用文档](https://learn.chatgpt.com/docs/plugins)列出 skills、MCP servers、可选 custom UI、browser extensions 和 hooks。插件目录是发现/安装入口。
2. [MCP UI 文档](https://learn.chatgpt.com/plugins/build/chatgpt-ui)建议使用 MCP Apps：工具通过 `_meta.ui.resourceUri` 关联 UI，iframe 使用 `ui/*` JSON-RPC bridge。UI 支持 inline、fullscreen、picture-in-picture；不能由此推出常驻宿主导航栏注册能力。
3. [UI reference](https://learn.chatgpt.com/plugins/reference)提供 `requestDisplayMode`、`safeArea`、`theme` 和 `availableDisplayModes`。官方明确建议能力探测，不按产品名称推断能力。
4. [插件打包文档](https://learn.chatgpt.com/plugins/build/plugins)新增可移植根目录 `plugin.json`/`mcp.json` 与 `extensions.com.openai`；既有 `.codex-plugin/plugin.json` 继续作为兼容格式。
5. [Windows 文档](https://learn.chatgpt.com/docs/windows/windows-app)明确支持原生 PowerShell/Windows sandbox，也可配置 WSL2。插件支持不等于本地注入、路径、标题栏或运行时完全一致。
6. [桌面端总览](https://learn.chatgpt.com/docs/app)统一介绍 ChatGPT/Codex 桌面工作流。[更新日志](https://developers.openai.com/codex/changelog)已核对 9 月 25 日 CLI 0.157.0 条目，但该条目不是截图布局对应的桌面发布证明。
   同时核对了 [What's new](https://learn.chatgpt.com/docs/whats-new) 的 9 月 7–25 日摘要：涉及模型、Pets 与 Windows Appshots；这些条目也不能用于认定本次侧栏截图的具体发布日期。
7. 本机 Mac 安装包版本 `26.924.22138`、build `11645`。只读包内代码显示 `nav[data-app-navigation-rail]`、`[data-sidebar-destination]`、`[data-app-shell-frame]`、`[data-app-shell-main-surface]`、`[data-app-shell-titlebar]`、`[data-app-shell-main-titlebar]` 等标记；旧 `.app-shell-left-panel` 仍存在。它们是当前实现细节，不是官方稳定扩展协议。
8. 修改前的 Team Codex 源码把挂载前置条件限制为 `aside.app-shell-left-panel nav[role="navigation"]`；页面只按单侧栏计算边界，Mac 跳过标题栏避让。这是本次适配双层导航的直接依据。

## 主张对账

| 主张 | 对象/版本 | 截至时间 | 支持证据 | 相反或相邻证据 | 证据类型 | 允许措辞 |
|---|---|---|---|---|---|---|
| 有官方自定义 UI 路径 | 当前 MCP Apps 文档 | 2026-09-26 | UI 文档、reference | 组件随工具/会话渲染 | 官方产品文档 | 可以评估 MCP Apps 作为官方会话入口 |
| 常驻左侧栏注册接口未被此次材料证实 | 已核对的插件使用、UI、reference、打包页 | 2026-09-26 | 文档列举 UI 资源及展示模式 | 全屏不等于导航注册；包内导航含内部实现 | 有范围的检索结论 | 本轮已读材料不足以确认常驻侧栏注册接口；不是断言官方不存在 |
| 新旧 manifest 可并存迁移 | 当前打包文档 | 2026-09-26 | compatibility fallback 明文 | 新格式非此次布局修复的必要条件 | 官方文档 | 保持旧格式，不做无收益迁移 |
| Mac/Win 不应按版本号硬分支 | 当前本地实现与官方能力探测建议 | 2026-09-26 | DOM 标记、UI 文档 | Windows 实机 DOM 未采集 | 代码证据与工程判断 | 按布局能力探测，分别验证平台边界 |
| 截图布局准确发布日期未确认 | 用户截图及 Mac build | 2026-09-26 | 用户截图、安装包元数据 | CLI 更新不是桌面布局公告 | 未知 | 不给截图变化套用 CLI 发布日期 |

## 来源方主张

官方称 MCP Apps 标准可在兼容宿主中运行，推荐 tools 在不渲染 UI 时仍可用。本轮未验证 Team Codex 的完整页面能在所有 Chat/Work/Codex 表面直接运行，不把这项官方设计目标当作本项目验收结果。

## 推断与实施选择

- 现有群聊/工作台继续使用受控 CDP 适配层：优先当前已知的全局 rail 标记，旧版退回明确的侧栏导航；未知结构停止挂载，不猜任意 nav。
- 新页面放在宿主主内容区，保留全局 rail、项目侧栏和标题栏；不修改原生导航状态或借用私有 destination 注册。
- MCP Apps 适合作为后续官方入口，但完整迁移还涉及服务鉴权、iframe CSP、工具封装与跨表面可用性，不在此次兼容补丁中仓促新增。

## 仍未确认

- 截图布局的准确桌面发布条目；Windows 用户安装版本与真实 DOM；实际宿主中的热重建和遮挡情况。Mac 最初检查时未开启调试端口，Computer Use 返回宿主操作安全限制，助手未重启或绕过。用户后续自行打开应用后，TeamCodex 状态文件记录了已连接调试端口但挂载失败；只读日志定位到冷启动空配置异常，见验收记录补充。隔离 DOM 夹具验证不等于实机完成。

## 查询记录

- AnySearch：`site:developers.openai.com Codex app plugins sidebar`、`Codex plugins sidebar extension`、`codex app changelog sidebar Windows macOS`、`site:developers.openai.com/plugins sidebar`、`site:learn.chatgpt.com September sidebar`；公开查询不含用户私有资料。
- 原文：上述链接通过 extract 或官方 `.md` 页面读取；`/docs/changelog.md` 与 `/codex/changelog.md` 返回 404，改读原始 changelog HTML 提取成功；记录失败路径，不据此推断文档不存在。
- 本机：读取 Info.plist、app.asar 内有关 DOM 的片段、项目源代码与打包清单；没有修改宿主安装包，没有操作账号或共享服务。
- 正反对撞：PASS。官方 UI 可用与本轮未确认常驻侧栏接口是不同主张；CLI 与桌面版本、源码与实机证据分别列出。

## 实施与验收

已完成本地布局适配：统一 DOM 能力探测、新 rail 图标入口、主内容边界与标题栏避让、重建恢复、鼠标悬停后点击菜单的竞态修复、未知布局无损收起、两平台分发清单。未修改 Hub 数据、账号权限或原生导航注册。

自动回归在冷启动修复后为 123 项通过、1 项原生组件测试跳过；此前打包逻辑回归 18 项通过。另以完整生产 UI 在浏览器隔离夹具验证新旧布局及 Mac/Windows 分支。详细命令、覆盖与实机缺口见 [验收记录](2026-09-26-host-integration-validation.md)。这些结果不能替代 Windows/macOS 原生客户端和安装包实测；未发布。
