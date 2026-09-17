# TeamCodex 🚀

> **面向 Codex / ChatGPT 桌面端的轻量级无缝团队协同空间与上下文实时中枢。**  
> 一键在左侧栏注入「TeamCodex」入口，零额外软件依赖，实现 Mac 与 Windows 跨设备/跨虚拟机的多人在通、会话快照共享与上下文秒级导入。

---

## 🌟 核心特性

- **侧栏原生注入**：无需魔改系统，自动在 Codex 原生侧栏「插件」下方内嵌「TeamCodex」入口，点击即可全屏唤起沉浸式协同工作区。
- **跨设备身份自动识别**：Mac 宿主机与 Windows 虚拟机自动区分设备标识（如 `🍎 weijia (Mac)` 与 `🪟 weijia (Win)`），支持真实在线人数指示与心跳检测，杜绝单机孤立。
- **会话快照与一键导入**：支持将原生对话一键打包为只读快照同步给团队成员；对方可查阅完整对话脉络，并支持「📥 一键导入到当前对话」，无缝接力协作。
- **协同空间口令（Smart Token）**：输入框或设置栏直接粘贴 `Hub: ... | Room: ... | Key: ...` 智能解构填入，支持一键秒连受保护空间。
- **高亮生命周期互斥**：全屏协作时侧栏保持单一选中高亮；切回原生会话时，毫秒级 100% 恢复原生高亮，杜绝状态冲突与闪烁。
- **极简私有部署**：轻量级 Node.js SSE 事件总线架构，数据完全在局域网内流通，绝不上云。

---

## 🖥️ 快速开始

### 🍎 macOS 启动

确保本地已安装 Node.js (>= 18)：

```bash
# 1. 克隆本仓库
git clone https://github.com/we1jia/TeamCodex.git
cd TeamCodex

# 2. 运行启动器（会自动附着或以调试端口拉起 Codex）
bash macos/launch.sh
# 或者直接双击运行「启动TeamCodex.command」
```

### 🪟 Windows (原生 / Parallels 虚拟机 / ARM64 / AMD64)

1. 下载或解压本仓库根目录下的 [`TeamCodex-Windows-arm64-amd64.zip`](./TeamCodex-Windows-arm64-amd64.zip) 到任意目录；
2. **首次使用**：双击运行 `一键安装到桌面.cmd`（自动在桌面创建快捷方式）；
3. **日常启动**：双击桌面的「TeamCodex」图标或运行 `启动TeamCodex.cmd`，自动发现宿主机中枢并注入。

---

## 📁 仓库目录结构

```text
TeamCodex/
├── inject/                     # 浏览器端注入逻辑与全屏协作 UI
│   ├── sidebar_fullscreen.js   # 核心渲染与状态机（Web Component / 样式隔离）
│   ├── attach_codex.mjs        # CDP 自动化附着与守护进程
│   └── safety.mjs              # 安全端口与进程检查
├── server/                     # 本地协作中枢
│   └── dev_host.mjs            # SSE 实时事件总线、多房间与快照存储
├── windows/                    # Windows 批处理与 PowerShell 启动套件
│   ├── 启动TeamCodex.cmd       # Windows 标准启动入口
│   ├── 启动测试模式.cmd        # 隔离测试模式（独立 CDP 与数据目录）
│   ├── build_zip.py            # Windows 离线包打包脚本
│   └── assets/                 # 应用图标资源 (.ico)
├── macos/                      # macOS 启动脚本与包装器
│   └── launch.sh               # macOS 一键启动 Shell
├── tests/                      # 全套自动化单元测试与端到端用例
│   ├── test_boost_fixes.mjs    # 状态机互斥、多端识别与高亮生命周期测试
│   └── test_rooms_and_auth.mjs # 房间密钥鉴权与消息隔离套件
├── TeamCodex-Windows-arm64-amd64.zip # 开箱即用离线绿色分发包
└── README.md
```

---

## 🧪 自动化测试验证

本项目拥有完备的测试套件，覆盖网络穿透、生命周期状态机与多房间隔离：

```bash
# 运行全部核心测试
node --test tests/test_boost_fixes.mjs
```

---

## 🛡️ 安全与隐私边界

- **零侵入**：不修改用户的 `~/.codex/config.toml`，不触碰系统级凭据与 Keychain；
- **纯内网安全**：消息与快照仅在设定的 Hub 地址及当前房间内交换，无任何第三方追踪与遥测；
- **只读快照导出**：仅同步用户主动勾选的内容，隐藏内部思维链与本地系统 Shell I/O。

---

## 📄 开源许可证

MIT License
