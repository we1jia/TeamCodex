$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-TeamCodexTray {
  Add-Type -AssemblyName Microsoft.VisualBasic
  try {
    [System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
  } catch {}

  # ==============================================================================
  # 1. 单实例互斥锁与防抖保护 (若已有实例，安全退出绝不互相强杀)
  # ==============================================================================
  $mutexName = "Local\TeamCodexTrayMutex"
  $createdNew = $false
  $script:trayMutex = $null
  try {
    $script:trayMutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
  } catch [System.Threading.AbandonedMutexException] {
    # 前序进程异常退出遗留的 AbandonedMutex，当前线程已成功接管所有权
    $createdNew = $true
  } catch {
    $createdNew = $false
  }
  if (-not $createdNew) {
    try {
      $launcherPort = if ($env:TEAM_CODEX_LAUNCHER_PORT) { $env:TEAM_CODEX_LAUNCHER_PORT } else { "18767" }
      Invoke-RestMethod -Uri "http://127.0.0.1:$launcherPort/api/wake" -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
    } catch {}
    exit 0
  }

  $launcherPort = if ($env:TEAM_CODEX_LAUNCHER_PORT) { $env:TEAM_CODEX_LAUNCHER_PORT } else { "18767" }
  $base = "http://127.0.0.1:$launcherPort"
  $installedVersion = "1.2.0"
  try {
    $versionFile = Join-Path (Split-Path -Parent $PSScriptRoot) "version.json"
    $manifest = Get-Content -LiteralPath $versionFile -Raw -Encoding utf8 | ConvertFrom-Json
    if ([string]$manifest.version -match '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
      $installedVersion = [string]$manifest.version
    }
  } catch { } # 旧安装目录缺失manifest时仍显示本脚本随包发布的版本。

  function Invoke-Launcher {
    param([string]$Path, [string]$Method = "GET", [string]$Body = $null)
    if ($Method -eq "GET") {
      try { return Invoke-RestMethod -Uri "$base$Path" -TimeoutSec 3 } catch { return $null }
    }
    # 重启可能需要等待用户保存；异步 HTTP + 消息泵，不冻结托盘也不超时后谎报成功。
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromSeconds(45)
    try {
      if (-not $Body) { $Body = "{}" }
      $content = New-Object System.Net.Http.StringContent($Body, [System.Text.Encoding]::UTF8, "application/json")
      $pending = $client.PostAsync("$base$Path", $content)
      while (-not $pending.IsCompleted) {
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 50
      }
      $response = $pending.GetAwaiter().GetResult()
      $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      return ($text | ConvertFrom-Json)
    } catch { return @{ ok = $false; message = "控制面请求失败或超时，状态未确认，请检查后再操作" } }
    finally { $client.Dispose() }
  }

  # ==============================================================================
  # 稳健加载托盘图标 (彻底解决 Win10/Win11 任务栏通知区图标透明/隐形问题)
  # ==============================================================================
  function Get-TeamCodexIcon {
    $searchDirs = @(
      (Join-Path $PSScriptRoot "assets"),
      $PSScriptRoot,
      (Join-Path (Split-Path -Parent $PSScriptRoot) "windows\assets"),
      (Join-Path (Split-Path -Parent $PSScriptRoot) "assets"),
      (Join-Path $env:LOCALAPPDATA "Programs\TeamCodex\windows\assets"),
      (Join-Path $env:LOCALAPPDATA "Programs\TeamCodex\assets"),
      (Join-Path $env:LOCALAPPDATA "TeamCodex\windows\assets"),
      (Join-Path $env:LOCALAPPDATA "TeamCodex\assets")
    )

    # 策略 1: 优先读取已生成的 Win32 标准 32位 DIB 格式 ICO (原生无损支持 32x32 及多种分辨率)
    $icoNames = @("TeamCodex.ico", "TeamContext.ico")
    foreach ($dir in $searchDirs) {
      foreach ($fn in $icoNames) {
        $p = Join-Path $dir $fn
        if (Test-Path -LiteralPath $p) {
          try {
            $ico = New-Object System.Drawing.Icon($p, 32, 32)
            if ($ico) { return $ico }
          } catch {}
          try {
            $ico = New-Object System.Drawing.Icon($p)
            if ($ico) { return $ico }
          } catch {}
          try {
            $bmp = [System.Drawing.Bitmap]::FromFile($p)
            if ($bmp -and $bmp.Width -gt 0) {
              $hIcon = $bmp.GetHicon()
              if ($hIcon -ne [System.IntPtr]::Zero) {
                return [System.Drawing.Icon]::FromHandle($hIcon)
              }
            }
          } catch {}
        }
      }
    }

    # 策略 2: 稳健兼容读取 PNG 资源并转为原生 Win32 32位 ARGB HICON
    $pngNames = @("TeamCodex-32.png", "TeamCodex.png", "icon.png")
    foreach ($dir in $searchDirs) {
      foreach ($fn in $pngNames) {
        $p = Join-Path $dir $fn
        if (Test-Path -LiteralPath $p) {
          try {
            $bmp = [System.Drawing.Bitmap]::FromFile($p)
            if ($bmp -and $bmp.Width -gt 0) {
              $hIcon = $bmp.GetHicon()
              if ($hIcon -ne [System.IntPtr]::Zero) {
                $ico = [System.Drawing.Icon]::FromHandle($hIcon)
                if ($ico) { return $ico }
              }
            }
          } catch {}
        }
      }
    }

    return [System.Drawing.SystemIcons]::Application
  }

  $notify = New-Object System.Windows.Forms.NotifyIcon
  $notify.Icon = Get-TeamCodexIcon
  $notify.Text = "TeamCodex"
  $notify.Visible = $true
  try {
    $notify.ShowBalloonTip(2000, "TeamCodex", "TeamCodex 协同套件已就绪，正在后台连接协作环境...", [System.Windows.Forms.ToolTipIcon]::Info)
  } catch {}

  # ==============================================================================
  # 2. 彻底还原原版右键菜单 (纯净原版，带状态、操作与彻底退出)
  # ==============================================================================
  $menu = New-Object System.Windows.Forms.ContextMenuStrip
  $statusCodex = $menu.Items.Add("Codex: 检测中")
  $statusHub = $menu.Items.Add("中枢: 检测中")
  $statusRoom = $menu.Items.Add("房间: —")
  $statusCodex.Enabled = $false
  $statusHub.Enabled = $false
  $statusRoom.Enabled = $false
  [void]$menu.Items.Add("-")
  $startItem = $menu.Items.Add("启动并挂载 Codex")
  $tokenItem = $menu.Items.Add("复制协同口令")
  $hubItem = $menu.Items.Add("切换中枢地址")
  $restartItem = $menu.Items.Add("重新挂载")
  [void]$menu.Items.Add("-")
  $updateItem = $menu.Items.Add("当前版本 $installedVersion")
  $exitItem = $menu.Items.Add("退出")
  $notify.ContextMenuStrip = $menu

  # ==============================================================================
  # 3. 专属原生悬浮控制面板弹窗 (左键点击唤起，失焦自动隐藏，原生 GDI 样式)
  # ==============================================================================
  $popup = New-Object System.Windows.Forms.Form
  $popup.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $popup.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $popup.ShowInTaskbar = $false
  $popup.TopMost = $true
  $popup.Size = New-Object System.Drawing.Size(316, 388)
  $popup.BackColor = [System.Drawing.Color]::FromArgb(26, 28, 34)
  $popup.ForeColor = [System.Drawing.Color]::FromArgb(242, 244, 248)
  $popup.KeyPreview = $true
  try { $popup.Icon = $notify.Icon } catch {}

  $cardPanel = New-Object System.Windows.Forms.Panel
  $cardPanel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $cardPanel.Padding = New-Object System.Windows.Forms.Padding(14, 12, 14, 12)
  $popup.Controls.Add($cardPanel)

  # 标题栏
  $headerPanel = New-Object System.Windows.Forms.Panel
  $headerPanel.Size = New-Object System.Drawing.Size(288, 28)
  $headerPanel.Location = New-Object System.Drawing.Point(14, 12)
  $cardPanel.Controls.Add($headerPanel)

  $titleLabel = New-Object System.Windows.Forms.Label
  $titleLabel.Text = "TeamCodex"
  $titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 11.5, [System.Drawing.FontStyle]::Bold)
  $titleLabel.AutoSize = $true
  $titleLabel.Location = New-Object System.Drawing.Point(0, 2)
  $titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
  $headerPanel.Controls.Add($titleLabel)

  $verLabel = New-Object System.Windows.Forms.Label
  $verLabel.Text = "v$installedVersion"
  $verLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9.0)
  $verLabel.AutoSize = $true
  $verLabel.Location = New-Object System.Drawing.Point(92, 6)
  $verLabel.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
  $headerPanel.Controls.Add($verLabel)

  $closeBtn = New-Object System.Windows.Forms.Label
  $closeBtn.Text = "✕"
  $closeBtn.Font = New-Object System.Drawing.Font("Segoe UI", 10.0, [System.Drawing.FontStyle]::Bold)
  $closeBtn.Size = New-Object System.Drawing.Size(24, 24)
  $closeBtn.Location = New-Object System.Drawing.Point(264, 2)
  $closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
  $closeBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
  $closeBtn.Add_Click({ $popup.Hide() })
  $headerPanel.Controls.Add($closeBtn)

  # 状态列表卡片容器
  $statusBox = New-Object System.Windows.Forms.Panel
  $statusBox.Size = New-Object System.Drawing.Size(288, 102)
  $statusBox.Location = New-Object System.Drawing.Point(14, 46)
  $statusBox.BackColor = [System.Drawing.Color]::FromArgb(34, 37, 46)
  $cardPanel.Controls.Add($statusBox)

  function New-StatusRow {
    param([string]$Key, [string]$Val, [int]$Y)
    $p = New-Object System.Windows.Forms.Panel
    $p.Size = New-Object System.Drawing.Size(288, 33)
    $p.Location = New-Object System.Drawing.Point(0, $Y)

    $dot = New-Object System.Windows.Forms.Label
    $dot.Size = New-Object System.Drawing.Size(12, 12)
    $dot.Location = New-Object System.Drawing.Point(10, 10)
    $dot.Text = "●"
    $dot.Font = New-Object System.Drawing.Font("Arial", 8.0)
    $dot.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
    $p.Controls.Add($dot)

    $lblK = New-Object System.Windows.Forms.Label
    $lblK.Text = $Key
    $lblK.Font = New-Object System.Drawing.Font("Segoe UI", 9.0)
    $lblK.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
    $lblK.Size = New-Object System.Drawing.Size(42, 20)
    $lblK.Location = New-Object System.Drawing.Point(26, 7)
    $p.Controls.Add($lblK)

    $lblV = New-Object System.Windows.Forms.Label
    $lblV.Text = $Val
    $lblV.Font = New-Object System.Drawing.Font("Segoe UI", 9.0)
    $lblV.ForeColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
    $lblV.Size = New-Object System.Drawing.Size(210, 20)
    $lblV.Location = New-Object System.Drawing.Point(72, 7)
    $lblV.AutoEllipsis = $true
    $p.Controls.Add($lblV)

    $statusBox.Controls.Add($p)
    return @{ Dot = $dot; Val = $lblV }
  }

  $rowCodex = New-StatusRow "Codex" "检测中..." 2
  $rowHub = New-StatusRow "中枢" "检测中..." 35
  $rowRoom = New-StatusRow "房间" "1024" 68

  # 原生悬停渲染支持 (彻底移除 Add_MouseEnter/MouseLeave，杜绝闭包 null 异常)
  function New-ActionButton {
    param([string]$Text, [int]$Y)
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = $Text
    $btn.Font = New-Object System.Drawing.Font("Segoe UI", 9.0)
    $btn.Size = New-Object System.Drawing.Size(288, 32)
    $btn.Location = New-Object System.Drawing.Point(14, $Y)
    $btn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btn.FlatAppearance.BorderSize = 1
    $btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(51, 55, 66)
    $btn.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(44, 48, 60)
    $btn.FlatAppearance.MouseDownBackColor = [System.Drawing.Color]::FromArgb(55, 60, 75)
    $btn.BackColor = [System.Drawing.Color]::FromArgb(34, 37, 46)
    $btn.ForeColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
    $btn.Cursor = [System.Windows.Forms.Cursors]::Hand
    $cardPanel.Controls.Add($btn)
    return $btn
  }

  $btnStart = New-ActionButton "启动并挂载 Codex" 158
  $btnToken = New-ActionButton "复制协同口令" 196
  $btnHub = New-ActionButton "切换中枢地址" 234
  $btnRestart = New-ActionButton "重新挂载" 272
  $btnUpdate = New-ActionButton "检查更新" 310

  $tipLabel = New-Object System.Windows.Forms.Label
  $tipLabel.Text = "点击外部或按 Esc 即可自动收起"
  $tipLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.0)
  $tipLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
  $tipLabel.Size = New-Object System.Drawing.Size(288, 18)
  $tipLabel.Location = New-Object System.Drawing.Point(14, 354)
  $tipLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $cardPanel.Controls.Add($tipLabel)

  $popup.Add_Deactivate({ $popup.Hide() })
  $popup.Add_KeyDown({
    param($s, $e)
    if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) { $popup.Hide() }
  })

  # ==============================================================================
  # 4. 防重入门禁状态刷新 (避免 UI 消息泵卡死)
  # ==============================================================================
  $script:isRefreshing = $false
  function Refresh-Status {
    if ($script:isRefreshing -or $script:isLaunching) { return }
    $script:isRefreshing = $true
    try {
      $s = Invoke-Launcher "/api/status"
      if (-not $s) { return }
      $actionLabel = if ($s.codex.injected) { "检查挂载状态" } elseif ($s.codex.state -eq "ready") { "立即挂载" } elseif ($s.codex.state -in @("restart_required", "connection_failed")) { "重启并挂载" } elseif ($s.codex.state -eq "not_running") { "启动并挂载 Codex" } else { "重新检查" }
      $startItem.Text = $actionLabel
      $btnStart.Text = $actionLabel
      $restartItem.Enabled = $s.codex.state -eq "ready"
      $btnRestart.Enabled = $s.codex.state -eq "ready"

      # 右键菜单纯净同步
      $statusCodex.Text = if ($s.codex.injected) { "Codex: 已挂载" } elseif ($s.codex.running) { "Codex: 已打开" } else { "Codex: 未连接" }
      $statusHub.Text = if ($s.hub.ok) { "中枢: $($s.hub.lanUrl)" } else { "中枢: 未连接" }
      $statusRoom.Text = "房间: $($s.room.id)"
      if ($s.update.has_update) {
        $updateItem.Text = "发现新版本 $($s.update.latest)"
        $btnUpdate.Text = "发现新版本 $($s.update.latest) (点击升级)"
        $btnUpdate.ForeColor = [System.Drawing.Color]::FromArgb(96, 165, 250)
        $notify.Text = "TeamCodex 有更新"
      } else {
        $updateItem.Text = if ($s.app_version -and $s.app_version -ne $installedVersion) { "安装 v$installedVersion · 服务 v$($s.app_version)" } else { "当前版本 $installedVersion" }
        $btnUpdate.Text = "检查更新"
        $btnUpdate.ForeColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
        $notify.Text = "TeamCodex"
      }

      # 左键弹窗状态同步
      $verLabel.Text = if ($s.app_version -and $s.app_version -ne $installedVersion) { "v$installedVersion · 服务待同步" } else { "v$installedVersion" }
      if ($s.codex.pending_update) {
        $rowCodex.Dot.ForeColor = [System.Drawing.Color]::FromArgb(234, 179, 8)
        $rowCodex.Val.Text = "待重新打开客户端加载新版"
      } elseif ($s.codex.injected) {
        $rowCodex.Dot.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
        $rowCodex.Val.Text = "已挂载"
      } elseif ($s.codex.running) {
        $rowCodex.Dot.ForeColor = [System.Drawing.Color]::FromArgb(234, 179, 8)
        $rowCodex.Val.Text = if ($s.codex.message) { [string]$s.codex.message } else { "已打开，等待挂载确认" }
      } else {
        $rowCodex.Dot.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
        $rowCodex.Val.Text = "未连接"
      }

      if ($s.hub.ok) {
        $rowHub.Dot.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
        $rowHub.Val.Text = "$($s.hub.lanUrl)"
      } else {
        $rowHub.Dot.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
        $rowHub.Val.Text = "未连接"
      }

      $rowRoom.Dot.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
      $rowRoom.Val.Text = "$($s.room.id)"

      # 检测二次双击唤醒事件并弹出反馈气泡
      if ($s.last_wake -and $s.last_wake -ne $script:handledWake) {
        $script:handledWake = $s.last_wake
        try {
          $notify.ShowBalloonTip(2000, "TeamCodex", "TeamCodex 协同套件已在运行中", [System.Windows.Forms.ToolTipIcon]::Info)
        } catch {}
      }
    } catch {} finally {
      $script:isRefreshing = $false
    }
  }

  function Toggle-PanelPopup {
    if ($popup.Visible) {
      $popup.Hide()
      return
    }
    Refresh-Status
    try {
      $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
      $x = [Math]::Max(10, $wa.Right - $popup.Width - 12)
      $y = [Math]::Max(10, $wa.Bottom - $popup.Height - 12)
      $popup.Location = New-Object System.Drawing.Point($x, $y)
      $popup.Show()
      $popup.Activate()
    } catch {}
  }

  # 动作函数
  $script:isLaunching = $false
  $doStart = {
    if ($script:isLaunching) { return }
    $script:isLaunching = $true
    $btnStart.Enabled = $false
    $startItem.Enabled = $false
    try {
      $result = Invoke-Launcher "/api/start-codex" "POST" "{}"
      if ($result -and $result.requires_restart_confirm -and $result.confirmToken) {
        $choice = [System.Windows.Forms.MessageBox]::Show([string]$result.message, "TeamCodex - 确认目标操作", [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Warning)
        if ($choice -ne [System.Windows.Forms.DialogResult]::Yes) {
          $notify.ShowBalloonTip(2000, "TeamCodex", "已取消，未启动或重启 Codex", [System.Windows.Forms.ToolTipIcon]::Info)
          return
        }
        $payload = @{ confirmToken = $result.confirmToken } | ConvertTo-Json -Compress
        $result = Invoke-Launcher "/api/start-codex" "POST" $payload
      }
      $message = if ($result.message) { [string]$result.message } else { "未收到有效结果，请检查控制面" }
      $notify.ShowBalloonTip(3500, "TeamCodex", $message, [System.Windows.Forms.ToolTipIcon]::Info)
    } finally {
      $script:isLaunching = $false
      $btnStart.Enabled = $true
      $startItem.Enabled = $true
      Refresh-Status
    }
  }
  $doToken = {
    try {
      $data = Invoke-Launcher "/api/token"
      if ($data -and $data.token) {
        [System.Windows.Forms.Clipboard]::SetText($data.token)
        $notify.ShowBalloonTip(2500, "TeamCodex", "口令已复制到剪贴板", [System.Windows.Forms.ToolTipIcon]::Info)
      }
    } catch {}
  }
  $doHub = {
    try {
      $s = Invoke-Launcher "/api/status"
      $current = if ($s) { $s.hub.url } else { "http://127.0.0.1:18765" }
      $input = [Microsoft.VisualBasic.Interaction]::InputBox("填写中枢地址", "TeamCodex", $current)
      if ($input) {
        $json = (@{ hub_url = $input } | ConvertTo-Json -Compress)
        Invoke-Launcher "/api/hub" "POST" $json | Out-Null
        Refresh-Status
      }
    } catch {}
  }
  $doRestart = {
    if ($script:isLaunching) { return }
    $script:isLaunching = $true
    $btnRestart.Enabled = $false
    $restartItem.Enabled = $false
    try {
      $result = Invoke-Launcher "/api/restart-inject" "POST" "{}"
      $notify.ShowBalloonTip(2000, "TeamCodex", [string]$result.message, [System.Windows.Forms.ToolTipIcon]::Info)
      Refresh-Status
    } catch {} finally { $script:isLaunching = $false; Refresh-Status }
  }
  $doUpdate = {
    try {
      $btnUpdate.Text = "正在检查更新..."
      $s = Invoke-Launcher "/api/update?force=1"
      if ($s -and $s.has_update) {
        $btnUpdate.Text = "发现新版本 $($s.latest) (点击升级)"
        $btnUpdate.ForeColor = [System.Drawing.Color]::FromArgb(96, 165, 250)
        $dlUrl = if ($s.asset -and $s.asset.url) { $s.asset.url } elseif ($s.url) { $s.url } else { "https://github.com/we1jia/TeamCodex/releases/latest" }
        $notify.ShowBalloonTip(3500, "TeamCodex 发现新版本", "正在打开新版本下载 (最新: $($s.latest))", [System.Windows.Forms.ToolTipIcon]::Info)
        Start-Process $dlUrl
      } elseif ($s -and $s.check_failed) {
        $btnUpdate.Text = "检查更新 (网络超时)"
        $notify.ShowBalloonTip(3500, "TeamCodex 检查更新", "$($s.message)。请检查网络或访问 GitHub Releases。", [System.Windows.Forms.ToolTipIcon]::Warning)
      } else {
        $btnUpdate.Text = "检查更新"
        $curVer = if ($s -and $s.current) { "v$($s.current)" } else { "当前版本" }
        $notify.ShowBalloonTip(3000, "TeamCodex 检查更新", "$curVer 已经是最新服务版本。界面是否加载请看实际挂载状态。", [System.Windows.Forms.ToolTipIcon]::Info)
      }
      Refresh-Status
    } catch {
      $btnUpdate.Text = "检查更新"
      $notify.ShowBalloonTip(3000, "TeamCodex", "检查更新请求异常", [System.Windows.Forms.ToolTipIcon]::Error)
    }
  }

  $script:appContext = New-Object System.Windows.Forms.ApplicationContext

  # ==============================================================================
  # 5. 彻底退出处理 (仅在用户显式点击菜单【退出】时执行，释放资源并清理)
  # ==============================================================================
  $doExit = {
    # 先确认后台实际退出，再销毁托盘；失败时保留恢复入口。
    try {
      $result = Invoke-Launcher "/api/shutdown" "POST" "{}"
      if (-not $result.ok) { throw "shutdown failed" }
      $closed = $false
      for ($i = 0; $i -lt 80; $i++) {
        Start-Sleep -Milliseconds 250
        try { Invoke-RestMethod -Uri "$base/api/runtime" -TimeoutSec 1 -ErrorAction Stop | Out-Null }
        catch {
          if ($_.Exception.InnerException -is [System.Net.Sockets.SocketException] -or $_.Exception.Status -eq [System.Net.WebExceptionStatus]::ConnectFailure) { $closed = $true; break }
        }
      }
      if (-not $closed) { throw "shutdown timeout" }
    } catch {
      $notify.ShowBalloonTip(3000, "TeamCodex", "后台尚未退出，已保留托盘，请稍后重试。Codex 和协作服务保持运行。", [System.Windows.Forms.ToolTipIcon]::Warning)
      return
    }
    try { if ($script:appContext) { $script:appContext.ExitThread() } } catch {}
    try { $timer.Stop(); $timer.Dispose() } catch {}
    try { $notify.Visible = $false; $notify.Dispose() } catch {}
    try { $popup.Close(); $popup.Dispose() } catch {}
    # 只退出此安装的控制面/注入器，保留共享 Hub，不按端口结束其他程序。
    try {
      if ($script:trayMutex) {
        $script:trayMutex.ReleaseMutex()
        $script:trayMutex.Dispose()
      }
    } catch {}
    try { [System.Environment]::Exit(0) } catch {}
    try { Stop-Process -Id $PID -Force } catch {}
  }

  $startItem.Add_Click($doStart)
  $btnStart.Add_Click($doStart)

  $tokenItem.Add_Click($doToken)
  $btnToken.Add_Click($doToken)

  $hubItem.Add_Click($doHub)
  $btnHub.Add_Click($doHub)

  $restartItem.Add_Click($doRestart)
  $btnRestart.Add_Click($doRestart)

  $updateItem.Add_Click($doUpdate)
  $btnUpdate.Add_Click($doUpdate)

  $exitItem.Add_Click($doExit)

  $notify.Add_MouseClick({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
      Toggle-PanelPopup
    }
  })
  $notify.Add_DoubleClick({
    Toggle-PanelPopup
  })

  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 2500
  $timer.Add_Tick({ Refresh-Status })
  $timer.Start()

  Refresh-Status
  try {
    [System.Windows.Forms.Application]::Run($script:appContext)
  } catch {}
}

Show-TeamCodexTray
