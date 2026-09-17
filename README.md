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

### 4. 快速开始与下载

#### 方式 A：原生应用安装包（推荐普通用户，开箱即用）

前往 [GitHub Releases](https://github.com/we1jia/TeamCodex/releases) 获取各平台最新原生应用安装包：

- **macOS 用户**：
  1. 下载原生安装镜像 **`TeamCodex-macOS.dmg`**；
  2. 双击打开镜像，将 `TeamCodex.app` 拖入 `Applications` 目录即可在启动台或聚焦搜索中直接使用；
  3. （亦提供免安装绿色包 `TeamCodex-macOS.zip`）。
- **Windows 用户**（原生系统 / Parallels 虚拟机 / ARM64 / AMD64）：
  1. 下载原生安装程序 **`TeamCodex-Setup.exe`**；
  2. 双击运行安装向导，一键完成安装并在桌面与开始菜单生成带图标的启动入口；
  3. （亦提供免安装绿色包 `TeamCodex-Windows-arm64-amd64.zip`，解压后双击 `一键安装到桌面.cmd`）。

#### 方式 B：源码运行（面向开发者）

##### 环境要求
- macOS 13+ 或 Windows 10/11 (x64 / ARM64)
- Node.js >= 18.0.0

##### macOS 启动
```bash
# 克隆代码仓库
git clone https://github.com/we1jia/TeamCodex.git
cd TeamCodex

# 执行启动脚本
bash macos/launch.sh
```

##### Windows 独立测试模式
直接运行 `windows/启动测试模式.cmd`，将在独立的数据目录和隔离端口中启动沙箱会话。

### 5. 中枢服务部署方案（本地 / 局域网 / 云端）

TeamCodex 协同中枢（`server/dev_host.mjs`）是纯原生 Node.js 实现（零第三方依赖），支持三种部署拓扑：

| 场景模式 | 运行方式 | 客户端接入方式 | 网络环境 |
|---|---|---|---|
| **模式 1：单机跨端（默认）** | Mac 客户端启动时自动在后台静默运行中枢服务 | Windows 虚拟机自动探测宿主机 IP 并直连 | 本地虚拟网桥（Parallels 等） |
| **模式 2：局域网私有协作** | 局域网内一台常开 PC、Mac 或 NAS 运行 `node server/dev_host.mjs` | 设置中填入该机内网 IP（如 `http://192.168.1.100:18765`）或粘贴 Smart Token | 同一办公区 / 实验室 Wi-Fi |
| **模式 3：云端公网服务器** | 任意 Linux 云服务器使用 `docker compose up -d` 或 PM2 部署 | 配合 Nginx 配置域名与 HTTPS，客户端直接接入公网域名 | 跨地域远程分布式团队 |

> 详细配置指南、Docker / Docker Compose 配置、Linux Systemd 常驻与 Nginx SSE 反向代理模板详见专有文档：  
> **[TeamCodex 中枢服务部署与网络接入全景指南 (docs/HUB_DEPLOYMENT.md)](docs/HUB_DEPLOYMENT.md)**

### 6. 协同口令规范 (Smart Token)

TeamCodex 支持通过单行复合口令实现房间快速加入。协议格式如下：

```text
Hub: http://<IP>:<PORT> | Room: <ROOM_NAME> | Key: <PASSWORD>
```

示例：

```text
Hub: http://10.211.55.2:18765 | Room: 1024 | Key: 123456
```

解析器将自动提取 Hub 地址、房间标识及鉴权密钥，并在验证后自动建立 SSE 实时通道。

### 7. 仓库目录结构

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

### 8. 质量保证与自动化测试

运行状态机与生命周期测试套件：

```bash
node --test tests/test_boost_fixes.mjs
```

运行房间隔离、鉴权认证与消息幂等性测试套件：

```bash
node --test tests/test_rooms_and_auth.mjs
```

### 9. 安全与合规边界

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

### 4. Quick Start & Downloads

#### Option A: Native Application Installers (Recommended, Ready to Use)

Download pre-built installers directly from [GitHub Releases](https://github.com/we1jia/TeamCodex/releases):

- **macOS Users**:
  1. Download the native disk image **`TeamCodex-macOS.dmg`**;
  2. Open the image and drag `TeamCodex.app` into `/Applications` to access it via Launchpad or Spotlight;
  3. (Portable `TeamCodex-macOS.zip` is also available).
- **Windows Users** (Native / Parallels VM / ARM64 / AMD64):
  1. Download the standalone executable installer **`TeamCodex-Setup.exe`**;
  2. Run the installer wizard to set up the app and create desktop shortcuts automatically;
  3. (Portable `TeamCodex-Windows-arm64-amd64.zip` is also available).

#### Option B: Run from Source (Developers)

##### Prerequisites
- macOS 13+ or Windows 10/11 (x64 / ARM64)
- Node.js >= 18.0.0

##### macOS Launch
```bash
# Clone repository
git clone https://github.com/we1jia/TeamCodex.git
cd TeamCodex

# Run launcher
bash macos/launch.sh
```

##### Windows Test Mode
Execute `windows/启动测试模式.cmd` to launch an isolated sandbox session with a dedicated profile directory.

### 5. Hub Deployment Models (Local / LAN / Cloud)

TeamCodex Hub (`server/dev_host.mjs`) is built on native Node.js with zero external dependencies, supporting three standard deployment topologies:

| Topology Model | Execution Method | Client Access Method | Target Network |
|---|---|---|---|
| **Model 1: Single-Host (Default)** | Spawned silently by the macOS launcher in the background | Windows VM auto-probes the host bridge IP | Local VM bridge (Parallels, etc.) |
| **Model 2: Private LAN** | Run `node server/dev_host.mjs` on an always-on PC, Mac, or NAS | Clients enter the local IP (e.g. `http://192.168.1.100:18765`) or paste a Token | Office / Lab shared Wi-Fi |
| **Model 3: Cloud VPS Hub** | Run via `docker compose up -d` or PM2 on any Linux VPS | Reverse proxy via Nginx with HTTPS domain name | Globally distributed remote teams |

> For comprehensive deployment configurations, Docker / Docker Compose templates, Linux Systemd units, and Nginx SSE stream buffering rules, see:  
> **[TeamCodex Hub Deployment & Networking Guide (docs/HUB_DEPLOYMENT.md)](docs/HUB_DEPLOYMENT.md)**

### 6. Smart Token Specification

TeamCodex supports single-line composite tokens for streamlined room access. The protocol adheres to the following specification:

```text
Hub: http://<IP>:<PORT> | Room: <ROOM_NAME> | Key: <PASSWORD>
```

Example:

```text
Hub: http://10.211.55.2:18765 | Room: 1024 | Key: 123456
```

The internal parser automatically extracts the hub endpoint, room identifier, and authentication key before initiating the SSE stream.

### 7. Directory Layout

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

### 8. Quality Assurance & Testing

Run state machine and lifecycle tests:

```bash
node --test tests/test_boost_fixes.mjs
```

Run multi-room isolation, authentication, and message idempotency tests:

```bash
node --test tests/test_rooms_and_auth.mjs
```

### 9. Security & Privacy Model

- **Zero Host Tampering**: Never alters `~/.codex/config.toml`, system registries, or Keychain credentials.
- **Physical LAN Confinement**: All communications are strictly restricted to the specified local network hub and authenticated room. No telemetry data is transmitted externally.
- **Sanitized Snapshot Sharing**: Snapshots only include approved conversational context and deliberately exclude internal Shell executions and private path references.
