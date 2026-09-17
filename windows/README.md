# TeamCodex Windows 客户端与测试套件（ARM64 + AMD64 双架构自适应）

本套件为 Windows 平台专属打造，全面支持 **Windows 11 on ARM（如 Parallels Desktop、VMware Fusion、UTM 等 Mac 虚拟机或 Surface 设备）** 以及 **标准 64位 Windows（AMD64 / Intel x64）**。

---

## 🌟 核心特性

1. **双架构原生自适应（ARM64 & AMD64）**：
   - 脚本通过 `$env:PROCESSOR_ARCHITECTURE` 自动识别系统硬件架构。
   - 在 Mac 的 ARM 虚拟机上以 **ARM64 原生模式**运行；在传统 PC 上以 **x64 模式**运行。
2. **免安装零配置便携运行时（Zero-Config）**：
   - 自动检测系统是否已安装 Node.js；
   - 若测试虚拟机为刚装好的纯净系统无 Node.js，脚本会自动从官方高速镜像获取对应架构（`win-arm64` 或 `win-x64`）的绿色免安装便携运行时，无需手动配置环境变量。
3. **彻底告别黑框（静默后台守护）**：
   - 提供 `启动TeamCodex(无黑框静默).vbs`，通过 Windows 宿主进程静默拉起，日常使用没有常驻黑色 CMD 窗口打扰。
4. **虚拟机隔离测试模式**：
   - 提供 `启动测试模式.cmd`，自动创建独立的本地临时空间和独立 Codex Profile，完全不影响您的日常账号和原有配置。

---

## 🚀 快速使用指南

### 方式一：虚拟机隔离快速测试（推荐先用此模式测试）
如果您刚在虚拟机中装好 Windows，推荐直接使用此模式验证：
1. 确保虚拟机中已安装 Windows 版 ChatGPT / Codex 客户端；
2. 双击运行 `启动测试模式.cmd`；
3. 脚本会自动：
   - 识别架构（ARM64 或 x64）；
   - 就绪便携运行时；
   - 启动独立 Hub 并拉起独立 Codex 窗口；
   - 自动在 Codex 左栏注入带有专属图标的 `TeamCodex` 选项卡；
4. 验证完成后，在控制台窗口按 `Ctrl+C` 或直接关闭，环境自动清理。

### 方式二：一键安装到桌面（日常使用）
1. 双击运行 `一键安装到桌面.cmd`；
2. 安装器会自动将运行所需组件部署至 `%LOCALAPPDATA%\TeamCodex\`，并在您的 Windows 桌面上生成两个快捷方式：
   - **`TeamCodex`**（带有专属图标）：日常一键静默启动，挂载至日常 Codex；
   - **`TeamCodex 隔离测试模式`**：一键拉起独立测试窗口。

### 方式三：前台日志排查模式
- 双击 `启动TeamCodex.cmd`，将在前台控制台打印完整的连接与挂载日志，方便排查。

---

## 🛠️ 环境变量与自定义配置（可选）

- **`TEAM_CODEX_EXE`**：若客户端安装在非常规目录，可指定其绝对路径，例如：
  ```powershell
  $env:TEAM_CODEX_EXE = "C:\CustomPath\ChatGPT.exe"
  ```
- **`TEAM_CODEX_PORT`**：TeamCodex 服务端口（默认 18765）。
- **`TEAM_CODEX_CDP_PORT`**：Codex CDP 调试端口（默认 18766）。

---

## 📁 目录结构

```text
team-context/windows/
├── 一键安装到桌面.cmd           # [推荐] 双击一键安装并在桌面生成快捷方式
├── 启动测试模式.cmd             # [测试专用] 虚拟机独立隔离测试启动器
├── 启动TeamCodex(无黑框静默).vbs # [日常模式] 后台静默启动，无黑色命令窗口
├── 启动TeamCodex.cmd           # 前台日志排查启动器
├── setup-runtime.ps1           # 架构自适应（ARM64/x64）免安装运行时下载就绪脚本
├── install-teamcodex.ps1       # 桌面部署主脚本
├── run-teamcodex.ps1           # 日常后台主控守护脚本
├── run-test.ps1                # 隔离测试主控脚本
└── assets/
    └── TeamCodex.ico           # Windows 高分辨率专属图标
```
