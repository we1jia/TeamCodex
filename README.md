# TeamCodex

面向 Codex 与 ChatGPT 桌面端的轻量级无侵入实时协同工作区与上下文接力同步中枢。  
告别“同事互相甩二手 AI 文档产生误差”，实现研发团队对话上下文与思维链的毫秒级无损对齐。

Seamless Real-time Collaboration Workspace & Context Hub for Codex & ChatGPT Desktop.  
Stop cascading errors from tossing static AI docs. Align reasoning chains and context instantly across engineering teams.

[![Release](https://img.shields.io/github/v/release/we1jia/TeamCodex?color=ea580c&style=flat-square)](https://github.com/we1jia/TeamCodex/releases)
[![Build](https://img.shields.io/badge/build-passing-16a34a?style=flat-square)](https://github.com/we1jia/TeamCodex/actions)
[![Tests](https://img.shields.io/badge/tests-58%2F58%20passed-16a34a?style=flat-square)](tests/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-52525b?style=flat-square)](https://github.com/we1jia/TeamCodex/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-f97316?style=flat-square)](server/dev_host.mjs)
[![License](https://img.shields.io/badge/license-MIT-52525b?style=flat-square)](LICENSE)

[English](#english) | [中文](#中文)

---

<a id="中文"></a>

## 中文

### 1. 立项初衷：为什么做这款工具？

在研发团队全员使用 Codex / ChatGPT 进行编码与架构攻坚时，个人单兵作战效率显著提升，但**团队协作却滑入了新的泥潭**：

- **痛点一：同事互相“甩二手 AI 文档”，导致误差与幻觉层层放大**  
  最典型的翻车现场：同事 A 问完 AI，直接把 AI 吐出的一大篇未经实测验证的 Markdown/Word 方案或接口草案打包“甩”给同事 B。同事 B 拿到这份二手文档再去喂给自己的本地 AI，导致两台机器在充满假定条件和虚假代码的前提下二次演绎，幻觉与误差被指数级放大，联调上线时频频踩坑互相扯皮。
- **痛点二：丢失前因后果与决策链路（The Missing "Why"）**  
  静态文档只呈现了 AI 最终吐出的一份“看似工整”的结果，却抹平了极其关键的技术推导背景——“排除了哪些踩坑方案？底层选型的边界依赖是什么？Prompt 经历过哪些纠偏？”接手的同事面对冰冷静态文本，根本无法理解前置设计意图。
- **痛点三：Prompt 孤岛与重复试错**  
  同事 A 花费半天向 AI 灌输了复杂业务规则并调优出排错上下文；同事 B 接手相关模块时其本地 AI 依然处于“失忆”状态，只能重新编写 Prompt 从零踩坑，重复消耗大量 Token 与工时心智。
- **痛点四：聊天工具手工搬运低效且极易泄密**  
  传统的微信/飞书截图或大段文本拷贝，不仅信息衰减严重，而且极易在剪贴板中意外泄露本地工程绝对路径、环境变量甚至 Shell 命令行密码。

**TeamCodex 的核心解法：以“真实动态上下文快照”彻底取代“甩二手静态文档”**：  
TeamCodex 将 **AI 的动态多轮推理链路（Context Chain）** 转化为像 Git Commit 一样可沉淀、可脱敏、可秒级接力的团队级资产。
- **原生内嵌**：通过 CDP 协议无侵入挂载在 Codex / ChatGPT 官方客户端侧栏，不破坏原生使用习惯；
- **一键脱敏快照**：随时将当前会话打包为自动过滤本地私密路径的协作快照；
- **秒级上下文对齐**：协作者在自己电脑上一键点击【导入】，完整的多轮思考过程即刻注入当前活动对话，让全团队的 AI 始终运行在**完全统一的事实基准面（Single Source of Truth）**上，从根源上消灭传话误差。

<p align="center">
  <img src="docs/assets/architecture_zh.png" alt="TeamCodex 系统架构全景" width="100%" />
</p>

---

### 2. 客户端下载与交互体验

前往 **[GitHub Releases 最新发布页](https://github.com/we1jia/TeamCodex/releases)** 下载官方原生安装包：

| 平台 | 安装包 | 交互形态与体验 |
|---|---|---|
| **macOS** | [`TeamCodex-macOS.dmg`](https://github.com/we1jia/TeamCodex/releases/latest) | 拖入 `Applications` 即可。状态栏全面升级为**纯白微矢量双云协同图标（Template Icon）**，带 1.7pt 负空间立体切缝与 `>_` 终端镂空，自适应深浅模式；点击弹出原生磨砂 Mini Dashboard 悬浮卡片 |
| **Windows** | [`TeamCodex-Setup.exe`](https://github.com/we1jia/TeamCodex/releases/latest) | 运行向导自动适配 ARM64/AMD64，常驻系统托盘，静默接管无黑框。**左键点击弹出原生深色悬浮卡片**（失焦/Esc 自动收起）；**右键点击弹出纯净原版上下文菜单**（点击【退出】秒速退出无卡死）；具备全局单实例 Mutex 互斥防双图标 |
| **免安装便携版** | `TeamCodex-macOS.zip` / `TeamCodex-Windows-arm64-amd64.zip` | 解压即用，适合移动介质或严格权限环境，Windows 附带 `退出TeamCodex.cmd` 应急一键清理工具 |

> **提示**：启动后应用常驻系统托盘/状态栏，点击即可展开 **Mini Dashboard 控制面板**，具备：
> - **状态自检**：实时显示 Codex 挂载状态（🟢 已挂载 / 🟡 等待挂载 / 🔴 未连接）、中枢地址与在线房间；
> - **一键操作**：支持【启动并挂载 Codex】、【复制 Smart Token】、【切换中枢地址】与【重启注入】；
> - **无感热更与版本检测**：自动拉取最新侧栏注入脚本，检测到底层新版本时支持一键下载；
> - **优雅退出**：右键菜单提供纯净退出选项，系统级强杀彻底消灭后台孤立进程。

---

### 3. 部署方案与网络拓扑

中枢服务（Hub）支持从本地单机到私有云的三种运行模式：

| 模式 | 运行位置 | 客户端接入方式 | 适用场景 |
|---|---|---|---|
| **单机跨端（默认）** | Mac 宿主机后台静默自启 | Windows 虚拟机自动探测宿主机 IP 直连 | Mac + Win 虚拟机本地开发（零配置） |
| **局域网协同** | 办公室内常开 PC / Mac / NAS | 填入该主机局域网 IP 或粘贴 Smart Token | 5 ~ 30 人同内网/同 Wi-Fi 研发小组 |
| **云端公网部署** | Linux 云服务器 (VPS) | 绑定域名并通过 Nginx HTTPS 反代接入 | 跨地域、远程办公的分布式团队 |

---

### 4. 中枢极速部署（局域网 / 云端）

#### 选项 A：一行命令自动化部署（推荐服务器使用）
```bash
curl -fsSL https://raw.githubusercontent.com/we1jia/TeamCodex/main/scripts/deploy-hub.sh | bash
```
脚本自动探测系统环境：优先通过 Docker Compose 启动容器；无 Docker 时自动注册 Systemd 或 PM2 守护进程，并自动执行健康自检。

#### 选项 B：一键发给终端 AI Agent 的部署提示词
使用 Claude Code、Codex、Cursor、OpenClaw 等终端 AI 运维服务器时，直接复制以下提示词发送：

```text
请帮我在当前服务器部署 TeamCodex Hub 中枢服务：
1. 检查服务器环境（需 Docker/Docker Compose 或 Node.js >= 18）；
2. 克隆 https://github.com/we1jia/TeamCodex.git 至 /opt/TeamCodex（若存在则 git pull）；
3. 优先执行 docker compose up -d，无 Docker 则创建 systemd 守护服务并设置开机自启；
4. 开放 18765 端口并监听 0.0.0.0；
5. 执行 curl http://127.0.0.1:18765/api/health 验证健康度；
6. 若有 Nginx，请配置反代，注意必须包含 proxy_buffering off 以保证 SSE 流式推送正常；
7. 输出本机的访问地址与测试 Smart Token。
```

完整参数表、Docker 编排配置与 Nginx SSL 模板参见：**[中枢部署与网络接入全景指南 (docs/HUB_DEPLOYMENT.md)](docs/HUB_DEPLOYMENT.md)**。

---

### 5. 核心特性

- **原生内嵌与菜单栏伴侣**：基于 CDP 动态挂载侧栏，配套 macOS 菜单栏 / Windows 托盘极简 Mini Dashboard，不抢占主工作区。
- **免重装双轨热更新**：连集中 Hub 时，侧栏注入脚本启动时自动动态下发并缓存生效，90% 的日常迭代免下载新包；底层外壳直通 Releases 检查。
- **高亮生命周期互斥**：全屏协作与原生会话保持单选高亮，切回历史对话 100% 恢复原生高亮。
- **跨平台多端识别与心跳保活**：自动探测网络与操作系统，智能区分 `Mac` 与 `Win` 设备身份，支持在线同名去重与活跃列表动态广播。
- **脱敏快照与上下文接力**：一键打包会话并剔除本地路径与 Shell 命令，协作者可一键导入当前活动对话。
- **智能协同口令 (Smart Token)**：支持形如 `Hub: <URL> | Room: <Name> | Key: <Password>` 的单行口令秒级加入与面板快捷复制。

---

### 6. 仓库结构

```text
TeamCodex/
├── inject/                     # CDP 客户端侧注入层、Web Component 与全屏协作 UI
│   ├── sidebar_fullscreen.js   # 侧栏嵌入、快照脱敏与协同状态机
│   └── attach_codex.mjs        # 动态拉取中枢最新脚本、CDP 挂载与心跳同步
├── server/                     # 零依赖原生 Node.js 协作服务
│   ├── dev_host.mjs            # SSE 实时协同中枢 (18765端口，在线人数/多房间/鉴权)
│   └── launcher_host.mjs       # 本地托盘控制面服务 (18767端口，自检/更新/口令)
├── ui/                         # 前端 UI 资源
│   ├── index.html              # 独立全屏协作网页端
│   └── panel.html              # 菜单栏/托盘 Mini Dashboard 悬浮控制卡片
├── macos/                      # macOS 菜单栏客户端与打包套件
│   ├── TeamCodex.swift         # 原生 Swift 状态栏应用源码 (Cocoa + WebKit)
│   ├── TeamCodex-Status.png    # 纯白微矢量双云协同图标 (Template Icon, 自适应深浅主题)
│   ├── launch.sh               # 运行时自检与守护脚本
│   └── build_dmg.py            # 自包含 DMG 构建器 (集成 swiftc 自动编译)
├── windows/                    # Windows 托盘套件与 NSIS 安装包工程
│   ├── tray-teamcodex.ps1      # 原生系统托盘控制台 (左键原生弹窗 + 右键原版菜单)
│   ├── run-teamcodex.ps1       # 启动守护与单实例 Mutex 互斥接管
│   ├── 退出TeamCodex.cmd       # [应急工具] 一键强杀所有后台进程并清理托盘
│   └── installer.nsi           # NSIS 安装向导配置
├── scripts/                    # 运维与自动化部署脚本 (deploy-hub.sh)
├── docs/                       # 架构设计与网络接入全景指南 (HUB_DEPLOYMENT.md)
├── tests/                      # 58 项全自动化测试套件 (单测与端到端状态机)
├── version.json                # 客户端版本定义 (v1.1.0)
├── Dockerfile                  # 极简 Alpine Node 生产镜像定义
├── docker-compose.yml          # 一键容器化服务编排
└── README.md
```

---

### 7. 自动化测试

```bash
node --test tests/test_boost_fixes.mjs
node --test tests/test_rooms_and_auth.mjs
# 输出：58 tests passed (35 状态机与注入测试 + 23 房间鉴权与隔离测试)
```

---

### 8. 常见问题 (FAQ)

- **Q: 以后功能更新需要全员重新下载安装包吗？**  
  **日常更新完全不需要**。TeamCodex 采用双轨更新机制：侧栏协作界面与注入逻辑会在连接团队集中中枢时自动热加载最新脚本；仅在涉及操作系统底层驱动或托盘框架升级时，控制面板才会提示下载新版安装包。
- **Q: 个人在本地单机使用，需要额外搭建服务器吗？**  
  **不需要**。macOS 启动时会自动常驻轻量中枢，Windows 虚拟机客户端通过虚拟网络自动发现并连入，完全免配置。
- **Q: 数据安全与隐私边界如何保证？**  
  **纯局域网与私有部署**。数据存储于自建环境的 `data/messages.json`，无任何外部云端遥测。
- **Q: 通过 Nginx 反代后消息无法实时推送？**  
  SSE 依赖流式长连接，Nginx 对应 `location` 必须配置 `proxy_buffering off;`。

---

<a id="english"></a>

## English

### 1. Motivation: Why We Built TeamCodex?

While individual engineers code faster with Codex and ChatGPT, **team engineering is sliding into a costly collaboration bottleneck**:

- **The "Document Tossing" Fallacy & Cascading Hallucinations**  
  A developer prompts the AI, exports a lengthy, unverified markdown document or draft spec, and casually tosses it to a colleague. The recipient feeds this second-hand AI output into their own AI. Unchecked assumptions and fake methods in the original doc get compounded, resulting in severe hallucinations, broken contracts, and endless debugging friction.
- **Erasing Decision Rationale (The Missing "Why")**  
  Static documents show only the final AI code snippet, completely erasing the vital problem-solving trajectory: "Which alternative architectures were ruled out? What boundary constraints were established? How was the prompt refined?" The next engineer inherits cold text without context, forced to guess the design intent.
- **Prompt Silos & Redundant Trial-and-Error**  
  Engineer A spends hours steering the model through nuanced domain rules and subtle edge cases. When Engineer B picks up the next task, their local AI starts with zero memory, forcing them to reinvent prompts and repeat costly mistakes.
- **Manual Copy-Paste is Lossy and Leaky**  
  Sharing screenshots or chat dumps over Slack/Discord flattens rich multi-turn reasoning chains while risking accidental exposure of local absolute filepaths, private tokens, and shell command histories.

**The Solution: Live Context Snapshots over Second-Hand Static Docs**:  
TeamCodex turns **AI conversation state into a first-class collaborative asset**—just like Git commits for source code.
- **Native Embedding**: Injected into official Codex / ChatGPT desktop sidebars via CDP without modifying native executables;
- **One-Click Sanitized Snapshots**: Instantly package active conversation threads with automatic scrubbing of local private paths;
- **Sub-Second Context Relay**: Peers click to import the full reasoning trajectory into their own active sessions, ensuring the entire team operates on a **single, verified source of truth**.

<p align="center">
  <img src="docs/assets/architecture_en.png" alt="TeamCodex System Architecture" width="100%" />
</p>

---

### 2. Client Downloads & Tray Companion

Grab pre-built installers directly from **[GitHub Releases](https://github.com/we1jia/TeamCodex/releases)**:

| Platform | Installer | Setup & Experience |
|---|---|---|
| **macOS** | [`TeamCodex-macOS.dmg`](https://github.com/we1jia/TeamCodex/releases/latest) | Drag `TeamCodex.app` into `/Applications`. Status bar upgraded to **Pure White Geometric Vector Cloud Template Icon** with negative space relief and `>_` terminal glyph, adapting automatically to Dark/Light modes; click to open frosted Mini Dashboard |
| **Windows** | [`TeamCodex-Setup.exe`](https://github.com/we1jia/TeamCodex/releases/latest) | Runs setup wizard for ARM64/AMD64. **Left-click opens native dark floating dashboard** (auto-dismiss on blur/Esc); **Right-click opens pristine context menu with instant clean exit**; guarded by global single-instance Mutex |
| **Portable Archives** | `TeamCodex-macOS.zip` / `TeamCodex-Windows-arm64-amd64.zip` | Standalone portable green packages; includes emergency cleanup tool `退出TeamCodex.cmd` |

> **Note**: TeamCodex runs as a lightweight tray companion. Click the menu bar or tray icon to open the **Mini Dashboard**:
> - **Live Diagnostics**: Instantly inspect Codex attachment status (🟢 Injected / 🟡 Waiting / 🔴 Disconnected), active Hub, and room occupancy;
> - **One-Click Actions**: Launch & attach Codex, copy Smart Token, switch Hub URL, and restart injection;
> - **In-Place Hot Sync & Updates**: Automatically pulls fresh injection logic; notifies when a new native binary release is available.

---

### 3. Deployment Topology Models

The Hub service supports three standard operational models:

| Model | Host Location | Client Connection | Target Scenario |
|---|---|---|---|
| **Single-Host (Default)** | macOS background auto-spawn | Windows VM auto-detects host bridge IP | Solo developers with Mac + VM setups (Zero config) |
| **Private LAN** | Always-on PC / Mac / NAS in LAN | Enter host LAN IP or paste Smart Token | 5 ~ 30 developer teams on shared office Wi-Fi |
| **Cloud VPS** | Linux Cloud Server | Domain name via Nginx HTTPS proxy | Globally distributed remote teams |

---

### 4. Hub Deployment & Automation (LAN / Cloud)

#### Option A: One-Line Automation Script
```bash
curl -fsSL https://raw.githubusercontent.com/we1jia/TeamCodex/main/scripts/deploy-hub.sh | bash
```
Detects environment automatically: prefers Docker Compose; falls back to Node.js with Systemd / PM2 process supervision and automated health verification.

#### Option B: AI Agent System Prompt
Copy and paste this structured prompt directly to terminal AI assistants (Claude Code, Codex, Cursor, OpenClaw):

```text
Deploy TeamCodex Hub on this server following production standards:
1. Verify system dependencies (Docker/Docker Compose or Node.js >= 18);
2. Clone https://github.com/we1jia/TeamCodex.git to /opt/TeamCodex (or git pull latest main);
3. Prefer docker compose up -d; if Docker is absent, configure systemd service with auto-start;
4. Open port 18765 listening on 0.0.0.0;
5. Validate via: curl http://127.0.0.1:18765/api/health;
6. If Nginx is detected, configure reverse proxy with proxy_buffering off explicitly set for SSE streaming;
7. Output endpoint URL and a ready-to-use Smart Token.
```

Full documentation and Nginx TLS templates available at: **[Hub Deployment & Networking Guide (docs/HUB_DEPLOYMENT.md)](docs/HUB_DEPLOYMENT.md)**.

---

### 5. Core Capabilities

- **Native Embedding & Tray Companion**: Injects via CDP into Codex sidebars paired with a native macOS menubar / Windows tray Mini Dashboard that never intrudes on your main workspace.
- **In-Place Hot Updates**: Automatically synchronizes and caches updated sidebar injection scripts from centralized Hubs without forcing users to re-download binaries.
- **State Machine Mutual Exclusion**: Enforces single-selection highlighting during active collaboration, restoring native thread selections upon exit.
- **Cross-Platform Presence**: Cleanly isolates `Mac` vs `Win` node identities with deduplicated active presence counters and heartbeat tracking.
- **Sanitized Snapshot Relay**: Serializes conversation threads into privacy-safe snapshots, enabling peers to import context with a single click.
- **Smart Token Protocol**: Resolves connection strings formatted as `Hub: <URL> | Room: <Name> | Key: <Password>` instantly with quick clipboard actions.

---

### 6. Repository Layout

```text
TeamCodex/
├── inject/                     # Client CDP injection, Web Components & UI logic
│   ├── sidebar_fullscreen.js   # Sidebar mount, snapshot scrub, and UI state machine
│   └── attach_codex.mjs        # Dynamic script sync, CDP attachment, and heartbeat loop
├── server/                     # Zero-dependency Node.js services
│   ├── dev_host.mjs            # SSE Collab Hub (Port 18765: presence, multi-room, auth)
│   └── launcher_host.mjs       # Local control plane service (Port 18767: status, updates)
├── ui/                         # Frontend UI assets
│   ├── index.html              # Fullscreen standalone collaboration canvas
│   └── panel.html              # Frosted Mini Dashboard floating card
├── macos/                      # macOS status bar app & packaging
│   ├── TeamCodex.swift         # Native Swift status bar source (Cocoa + WebKit)
│   ├── TeamCodex-Status.png    # Pure white vector cloud template icon (Dark/Light adaptive)
│   ├── launch.sh               # Runtime health supervisor
│   └── build_dmg.py            # Standalone DMG builder with swiftc automation
├── windows/                    # Windows tray suite & NSIS installer
│   ├── tray-teamcodex.ps1      # Native tray companion (Left-click popup + Right-click menu)
│   ├── run-teamcodex.ps1       # Startup supervisor with single-instance mutex
│   ├── 退出TeamCodex.cmd       # [Emergency tool] One-click kill & tray cache cleanup
│   └── installer.nsi           # NSIS setup wizard configuration
├── scripts/                    # Ops & automation deployment scripts (deploy-hub.sh)
├── docs/                       # Architectural & deployment manuals (HUB_DEPLOYMENT.md)
├── tests/                      # 58 automated unit and end-to-end test cases
├── version.json                # Client version manifest (v1.1.0)
├── Dockerfile                  # Lightweight Alpine production container definition
├── docker-compose.yml          # Container orchestration configuration
└── README.md
```

---

### 7. Automated Testing

```bash
node --test tests/test_boost_fixes.mjs
node --test tests/test_rooms_and_auth.mjs
# Output: 58 tests passed (35 state machine & injection tests + 23 room auth & isolation tests)
```

---

### 8. FAQ

- **Q: Do team members need to re-download binaries for regular updates?**  
  **No**. TeamCodex uses dual-track updates: sidebar collaboration scripts update dynamically in-place when connected to a team Hub. Native installers are only required when underlying platform drivers change.
- **Q: Does a solo developer on one machine need to host a cloud server?**  
  **No**. macOS auto-starts the hub in the background, and Windows VM guests auto-detect the bridge IP out of the box.
- **Q: Is conversation data transmitted to external third parties?**  
  **No**. TeamCodex operates purely on self-hosted instances. Data is confined to your own `data/messages.json`.
- **Q: Real-time updates do not reach clients when behind Nginx?**  
  SSE streaming requires unbuffered connections. Ensure **`proxy_buffering off;`** is present in the Nginx `location` block.
