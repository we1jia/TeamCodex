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
  # 1. 单实例互斥锁与旧进程清洗 (采用 Local 作用域杜绝普通权限下的 UnauthorizedAccessException)
  # ==============================================================================
  $mutexName = "Local\TeamCodexTrayMutex"
  $createdNew = $false
  $script:trayMutex = $null
  try {
    $script:trayMutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
    if (-not $createdNew) {
      $oldProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "powershell.exe" -and $_.ProcessId -ne $PID -and ($_.CommandLine -like "*tray-teamcodex*" -or $_.CommandLine -like "*run-teamcodex*")
      }
      foreach ($p in $oldProcs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
      }
      Start-Sleep -Milliseconds 250
    }
  } catch {}

  $launcherPort = if ($env:TEAM_CODEX_LAUNCHER_PORT) { $env:TEAM_CODEX_LAUNCHER_PORT } else { "18767" }
  $base = "http://127.0.0.1:$launcherPort"

  function Invoke-Launcher {
    param([string]$Path, [string]$Method = "GET", [string]$Body = $null)
    try {
      if ($Method -eq "GET") {
        return Invoke-RestMethod -Uri "$base$Path" -TimeoutSec 1
      }
      if ($Body) {
        return Invoke-RestMethod -Uri "$base$Path" -Method Post -ContentType "application/json" -Body $Body -TimeoutSec 2
      }
      return Invoke-RestMethod -Uri "$base$Path" -Method Post -TimeoutSec 2
    } catch {
      return $null
    }
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

    # 策略 1: 优先读取 PNG 资源并转为原生 Win32 32位 ARGB HICON (彻底规避旧 GDI+ 对 ICO 的透明度解码缺陷)
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

    # 策略 2: 兼容读取标准微软 32位 DIB 格式 ICO
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
            if ($bmp) {
              $hIcon = $bmp.GetHicon()
              if ($hIcon -ne [System.IntPtr]::Zero) {
                return [System.Drawing.Icon]::FromHandle($hIcon)
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
  $restartItem = $menu.Items.Add("重启注入")
  [void]$menu.Items.Add("-")
  $updateItem = $menu.Items.Add("当前版本 1.1.4")
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
  $verLabel.Text = "v1.1.4"
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
  $btnRestart = New-ActionButton "重启注入" 272
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
    if ($script:isRefreshing) { return }
    $script:isRefreshing = $true
    try {
      $s = Invoke-Launcher "/api/status"
      if (-not $s) { return }

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
        $updateItem.Text = "当前版本 $($s.app_version)"
        $btnUpdate.Text = "检查更新"
        $btnUpdate.ForeColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
        $notify.Text = "TeamCodex"
      }

      # 左键弹窗状态同步
      $verLabel.Text = "v$($s.app_version)"
      if ($s.codex.injected) {
        $rowCodex.Dot.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
        $rowCodex.Val.Text = "已挂载"
      } elseif ($s.codex.running) {
        $rowCodex.Dot.ForeColor = [System.Drawing.Color]::FromArgb(234, 179, 8)
        $rowCodex.Val.Text = "已打开"
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
  $doStart = {
    try {
      Invoke-Launcher "/api/start-codex" "POST" | Out-Null
      $notify.ShowBalloonTip(2000, "TeamCodex", "正在启动并挂载 Codex...", [System.Windows.Forms.ToolTipIcon]::Info)
      Refresh-Status
    } catch {}
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
    try {
      Invoke-Launcher "/api/restart-inject" "POST" | Out-Null
      $notify.ShowBalloonTip(2000, "TeamCodex", "正在重启注入...", [System.Windows.Forms.ToolTipIcon]::Info)
      Refresh-Status
    } catch {}
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
        Invoke-Launcher "/api/restart-inject" "POST" | Out-Null
        $curVer = if ($s -and $s.current) { "v$($s.current)" } else { "当前版本" }
        $notify.ShowBalloonTip(3000, "TeamCodex 检查更新", "$curVer 已经是最新版本！已刷新免重装热更新。", [System.Windows.Forms.ToolTipIcon]::Info)
      }
      Refresh-Status
    } catch {
      $btnUpdate.Text = "检查更新"
      $notify.ShowBalloonTip(3000, "TeamCodex", "检查更新请求异常", [System.Windows.Forms.ToolTipIcon]::Error)
    }
  }

  $script:appContext = New-Object System.Windows.Forms.ApplicationContext

  # ==============================================================================
  # 5. 彻底强力退出处理 (立即释放资源并强杀进程，绝不挂起)
  # ==============================================================================
  $doExit = {
    try { if ($script:appContext) { $script:appContext.ExitThread() } } catch {}
    try { $timer.Stop() } catch {}
    try { $notify.Visible = $false } catch {}
    try { $notify.Dispose() } catch {}
    try { $popup.Close() } catch {}
    try { $popup.Dispose() } catch {}
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
  } finally {
    & $doExit
  }
}

Show-TeamCodexTray
