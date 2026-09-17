# TeamCodex

[English](#english) | [中文](#中文)

---

<a id="中文"></a>

## 中文

### 1. 项目概述

TeamCodex 是面向 OpenAI Codex / ChatGPT 桌面客户端的轻量级跨端团队协作工作区与上下文实时同步中枢。

针对原生 AI 桌面端在多开发者协同、跨机调试以及多平台虚拟机协作场景下缺乏局域网互联的痛点，TeamCodex 采用无侵入式 CDP (Chrome DevTools Protocol) 挂载技术，直接在 Codex 原生侧边栏内嵌全功能协作入口。无需依赖外部云端服务，即可在本地局域网内实现跨设备（macOS 宿主机与 Windows 原生/虚拟机）的成员状态同步、对话快照归档与跨会话秒级上下文接力。

### 2. 系统架构与通信模型

TeamCodex 由侧栏注入层、局域网协同中枢与多端适配脚本三层构成：

```
+-------------------------------------------------------------------------+
|                              Codex Desktop                              |
|                                                                         |
|   +-------------------+  +------------------------------------------+   |
|   |  Native Sidebar   |  |        Main Workspace View               |   |
|   |                   |  |                                          |   |
|   |  [Conversations]  |  |  [Active Native Conversation Thread]     |   |
|   |  [Plugins]        |  |                      OR                  |   |
|   |  * TeamCodex Tab  |  |  [TeamCodex Fullscreen Collab View]      |   |
|   +---------+---------+  +--------------------+---------------------+   |
+-------------|---------------------------------|-------------------------+
              |                                 |
              | (CDP Port 9222 Attach)          | (PostMessage / Event Dispatch)
              v                                 v
+-------------------------------------------------------------------------+
|                  Injection Layer (inject/sidebar_fullscreen.js)         |
|  - Web Component & Shadow DOM Isolation                                 |
|  - Active/Inactive Highlighting State Machine Mutex                     |
|  - Smart Token Parser & Snapshot Desensitization Ingestion              |
+------------------------------------+------------------------------------+
                                     |
                                     | HTTP / SSE (EventSource Stream)
                                     v
+-------------------------------------------------------------------------+
|                   Local Collaboration Hub (server/dev_host.mjs)         |
|  - Port 18765 Event Bus                                                 |
|  - Multi-Room Isolation & Room Key Authentication (401 Handling)        |
|  - Dynamic Member Heartbeat & Cross-Platform Identity Recognition       |
|  - Snapshot Persistence & Idempotent Message Storage                    |
+-------------------------------------------------------------------------+
```

### 3. 核心特性

- **无侵入式原生侧栏注入**：无需反编译或修改系统文件，通过 CDP 协议自动化附着，在侧栏平滑内嵌「TeamCodex」选项卡，支持独立全屏工作区与原生会话窗口无缝切换。
- **高亮生命周期互斥状态机**：全屏协作期间侧栏保持单选高亮；切换回原生历史会话时，毫秒级百分之百恢复原生选中状态，杜绝界面状态冲突与视觉闪烁。
- **跨平台与跨虚拟机身份识别**：自动探测网络拓扑与操作系统类型，智能区分 Mac 宿主机与 Windows 虚拟机用户标识（如 `weijia (Mac)` 与 `weijia (Win)`），支持在线人数同名去重与心跳保活。
- **安全脱敏快照与一键上下文导入**：支持将原生对话一键打包为脱敏只读快照同步至协同中枢（剔除本地敏感系统路径与 Shell I/O），其他协作成员可查阅完整交互链路并一键导入至自身当前活动对话。
- **复合协同口令 (Smart Token)**：支持形如 `Hub: <URL> | Room: <Name> | Key: <Password>` 的智能口令，支持输入框与设置栏剪贴板自动解析并分拆填充。
- **纯局域网数据闭环**：基于轻量 Node.js SSE (Server-Sent Events) 事件总线架构，所有消息与快照仅在本地网络流转，零云端遥测与外部依赖。

### 4. 快速开始

#### 环境要求

- macOS 13+ 或 Windows 10/11 (x64 / ARM64)
- Node.js >= 18.0.0

#### macOS 启动

```bash
# 1. 克隆代码仓库
git clone https://github.com/we1jia/TeamCodex.git
cd TeamCodex

# 2. 执行启动脚本（自动探测现有实例或以调试端口拉起 Codex）
bash macos/launch.sh

# 亦可直接双击运行
./启动TeamCodex.command
```

#### Windows (原生系统 / Parallels Desktop 虚拟机)

1. 解压根目录下的 `TeamCodex-Windows-arm64-amd64.zip`；
2. **首次配置**：右键以管理员或普通用户运行 `一键安装到桌面.cmd`，自动生成桌面快捷方式；
3. **日常启动**：双击桌面的 `TeamCodex` 快捷方式或直接运行 `启动TeamCodex.cmd`，脚本将自动探测 Mac 宿主机中枢服务并完成注入；
4. **独立测试模式**：运行 `启动测试模式.cmd`，将在独立的数据目录和隔离端口中启动沙箱会话。

### 5. 协同口令规范 (Smart Token)

TeamCodex 支持通过单行复合口令实现房间快速加入。协议格式如下：

```text
Hub: http://<IP>:<PORT> | Room: <ROOM_NAME> | Key: <PASSWORD>
```

示例：

```text
Hub: http://10.211.55.2:18765 | Room: 1024 | Key: 123456
```

解析器将自动提取 Hub 地址、房间标识及鉴权密钥，并在验证后自动建立 SSE 实时通道。

### 6. 仓库目录结构

```text
TeamCodex/
├── inject/                     # 客户端侧注入层与核心渲染逻辑
│   ├── sidebar_fullscreen.js   # 协作 UI 渲染、Shadow DOM 与生命周期状态机
│   ├── attach_codex.mjs        # CDP 端口探测、自动化注入与保活进程
│   └── safety.mjs              # 端口占用检测与进程安全防护
├── server/                     # 本地协作中枢
│   └── dev_host.mjs            # SSE 实时事件总线、房间密钥鉴权与快照管理
├── macos/                      # macOS 启动脚本与引导工具
│   └── launch.sh               # macOS 自动附着 Shell 脚本
├── windows/                    # Windows 批处理套件与离线构建工程
│   ├── 启动TeamCodex.cmd       # Windows 生产启动入口
│   ├── 启动测试模式.cmd        # 独立数据目录测试入口
│   ├── build_zip.py            # 离线分发包打包脚本
│   └── assets/                 # Windows 应用程序图标资源 (.ico)
├── tests/                      # 自动化测试用例
│   ├── test_boost_fixes.mjs    # 状态机互斥、身份识别与高亮生命周期测试
│   └── test_rooms_and_auth.mjs # 房间密钥鉴权、SSE 消息隔离与幂等性测试
├── TeamCodex-Windows-arm64-amd64.zip # 开箱即用绿色免安装分发包
└── README.md
```

### 7. 质量保证与自动化测试

运行状态机与生命周期测试套件：

```bash
node --test tests/test_boost_fixes.mjs
```

运行房间隔离、鉴权认证与消息幂等性测试套件：

```bash
node --test tests/test_rooms_and_auth.mjs
```

### 8. 安全与合规边界

- **系统零污染**：不篡改 `~/.codex/config.toml` 或系统注册表，不读取系统 Keychain 凭据。
- **物理内网隔离**：通信严格限定在局域网 Hub 地址与指定房间内部，不存在外部遥测数据上报。
- **快照权限控制**：快照仅导出用户当前确认的分支上下文，自动过滤底层 Shell 调用命令与私有绝对路径。

---

<a id="english"></a>

## English

### 1. Overview

TeamCodex is a lightweight, non-intrusive cross-platform collaboration workspace and context synchronization hub designed for OpenAI Codex and ChatGPT desktop clients.

Traditional AI desktop clients operate as isolated single-user environments, creating communication silos during team pair programming and host-to-virtual-machine workflows. TeamCodex bridges this gap by leveraging the Chrome DevTools Protocol (CDP) to inject an integrated collaboration workspace directly into the client's native sidebar. Operating entirely over local networks without third-party cloud dependencies, it enables real-time peer presence, dialogue snapshot sharing, and instant cross-session context handoffs across macOS hosts and Windows virtual machines.

### 2. Architecture & Communication Model

TeamCodex comprises three functional layers: the client injection layer, the local collaboration hub, and cross-platform launcher toolchains:

```
+-------------------------------------------------------------------------+
|                              Codex Desktop                              |
|                                                                         |
|   +-------------------+  +------------------------------------------+   |
|   |  Native Sidebar   |  |        Main Workspace View               |   |
|   |                   |  |                                          |   |
|   |  [Conversations]  |  |  [Active Native Conversation Thread]     |   |
|   |  [Plugins]        |  |                      OR                  |   |
|   |  * TeamCodex Tab  |  |  [TeamCodex Fullscreen Collab View]      |   |
|   +---------+---------+  +--------------------+---------------------+   |
+-------------|---------------------------------|-------------------------+
              |                                 |
              | (CDP Port 9222 Attach)          | (PostMessage / Event Dispatch)
              v                                 v
+-------------------------------------------------------------------------+
|                  Injection Layer (inject/sidebar_fullscreen.js)         |
|  - Web Component & Shadow DOM Isolation                                 |
|  - Active/Inactive Highlighting State Machine Mutex                     |
|  - Smart Token Parser & Snapshot Desensitization Ingestion              |
+------------------------------------+------------------------------------+
                                     |
                                     | HTTP / SSE (EventSource Stream)
                                     v
+-------------------------------------------------------------------------+
|                   Local Collaboration Hub (server/dev_host.mjs)         |
|  - Port 18765 Event Bus                                                 |
|  - Multi-Room Isolation & Room Key Authentication (401 Handling)        |
|  - Dynamic Member Heartbeat & Cross-Platform Identity Recognition       |
|  - Snapshot Persistence & Idempotent Message Storage                    |
+-------------------------------------------------------------------------+
```

### 3. Core Features

- **Non-Intrusive Native Sidebar Injection**: Dynamically attaches via Chrome DevTools Protocol without modifying system executables or configuration files, mounting a native "TeamCodex" tab in the sidebar.
- **Mutual Exclusion State Machine**: Enforces strict single-selection highlighting during fullscreen collaboration. Seamlessly restores native conversation highlights with zero latency or layout flicker upon exit.
- **Cross-Platform & Virtual Machine Awareness**: Automatically detects network topology and operating systems, cleanly distinguishing host and guest identities (e.g., `weijia (Mac)` vs `weijia (Win)`) with duplicate-filtered active presence counters.
- **Desensitized Snapshot & Instant Context Ingestion**: Packages conversation threads into read-only snapshots (filtering internal Shell commands and absolute filesystem paths) for teammates to inspect and inject into their active sessions with one click.
- **Composite Smart Token Protocol**: Parses connection strings structured as `Hub: <URL> | Room: <Name> | Key: <Password>`, automatically populating host endpoints, room credentials, and access keys.
- **LAN-Bounded Data Privacy**: Built upon a lightweight Node.js Server-Sent Events (SSE) event bus. All message transactions and snapshot transfers remain confined to the local network.

### 4. Quick Start

#### Prerequisites

- macOS 13+ or Windows 10/11 (x64 / ARM64)
- Node.js >= 18.0.0

#### macOS Setup

```bash
# 1. Clone repository
git clone https://github.com/we1jia/TeamCodex.git
cd TeamCodex

# 2. Execute launcher (automatically attaches to existing instance or starts debug port)
bash macos/launch.sh

# Or double-click
./启动TeamCodex.command
```

#### Windows Setup (Native / Parallels Desktop VM)

1. Extract `TeamCodex-Windows-arm64-amd64.zip` located in the root directory;
2. **First-time configuration**: Run `一键安装到桌面.cmd` to generate a desktop shortcut;
3. **Daily launch**: Double-click the `TeamCodex` desktop shortcut or run `启动TeamCodex.cmd`. The script will probe the Mac host hub and attach automatically;
4. **Isolated test mode**: Execute `启动测试模式.cmd` to start an isolated sandbox instance with a dedicated profile directory.

### 5. Smart Token Specification

TeamCodex supports single-line composite tokens for streamlined room access. The protocol adheres to the following specification:

```text
Hub: http://<IP>:<PORT> | Room: <ROOM_NAME> | Key: <PASSWORD>
```

Example:

```text
Hub: http://10.211.55.2:18765 | Room: 1024 | Key: 123456
```

The internal parser automatically extracts the hub endpoint, room identifier, and authentication key before initiating the SSE stream.

### 6. Directory Layout

```text
TeamCodex/
├── inject/                     # Client injection layer and core UI logic
│   ├── sidebar_fullscreen.js   # Collaboration UI rendering, Shadow DOM, and state machines
│   ├── attach_codex.mjs        # CDP port probing, automated injection, and watchdog loop
│   └── safety.mjs              # Port inspection and process guards
├── server/                     # Local collaboration server
│   └── dev_host.mjs            # SSE event bus, room key authentication, and snapshot store
├── macos/                      # macOS automation scripts
│   └── launch.sh               # macOS launch shell script
├── windows/                    # Windows batch suites and packaging tooling
│   ├── 启动TeamCodex.cmd       # Windows production entry point
│   ├── 启动测试模式.cmd        # Isolated testing entry point
│   ├── build_zip.py            # Standalone distribution packaging script
│   └── assets/                 # Application icon assets (.ico)
├── tests/                      # Automated test suite
│   ├── test_boost_fixes.mjs    # State machine, identity detection, and highlight tests
│   └── test_rooms_and_auth.mjs # Room key auth, SSE isolation, and idempotency tests
├── TeamCodex-Windows-arm64-amd64.zip # Standalone pre-packaged distribution archive
└── README.md
```

### 7. Quality Assurance & Testing

Run state machine and lifecycle tests:

```bash
node --test tests/test_boost_fixes.mjs
```

Run multi-room isolation, authentication, and message idempotency tests:

```bash
node --test tests/test_rooms_and_auth.mjs
```

### 8. Security & Privacy Model

- **Zero Host Tampering**: Never alters `~/.codex/config.toml`, system registries, or Keychain credentials.
- **Physical LAN Confinement**: All communications are strictly restricted to the specified local network hub and authenticated room. No telemetry data is transmitted externally.
- **Sanitized Snapshot Sharing**: Snapshots only include approved conversational context and deliberately exclude internal Shell executions and private path references.
