$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-TeamCodexTray {
  Add-Type -AssemblyName Microsoft.VisualBasic
  $launcherPort = if ($env:TEAM_CODEX_LAUNCHER_PORT) { $env:TEAM_CODEX_LAUNCHER_PORT } else { "18767" }
  $base = "http://127.0.0.1:$launcherPort"

  function Invoke-Launcher {
    param([string]$Path, [string]$Method = "GET", [string]$Body = $null)
    try {
      if ($Method -eq "GET") {
        return Invoke-RestMethod -Uri "$base$Path" -TimeoutSec 3
      }
      if ($Body) {
        return Invoke-RestMethod -Uri "$base$Path" -Method Post -ContentType "application/json" -Body $Body -TimeoutSec 5
      }
      return Invoke-RestMethod -Uri "$base$Path" -Method Post -TimeoutSec 5
    } catch {
      return $null
    }
  }

  $notify = New-Object System.Windows.Forms.NotifyIcon
  $iconPath = Join-Path $PSScriptRoot "assets\TeamCodex.ico"
  if (Test-Path -LiteralPath $iconPath) {
    $notify.Icon = New-Object System.Drawing.Icon($iconPath)
  } else {
    $notify.Icon = [System.Drawing.SystemIcons]::Application
  }
  $notify.Text = "TeamCodex 团队协作"
  $notify.Visible = $true

  $menu = New-Object System.Windows.Forms.ContextMenuStrip
  $openPanelItem = $menu.Items.Add("打开控制面板 (Mini Dashboard)")
  $openPanelItem.Font = New-Object System.Drawing.Font($menu.Font, [System.Drawing.FontStyle]::Bold)
  [void]$menu.Items.Add("-")
  $statusCodex = $menu.Items.Add("Codex: 检测中")
  $statusHub = $menu.Items.Add("中枢: 检测中")
  $statusRoom = $menu.Items.Add("房间: —")
  $statusCodex.Enabled = $false
  $statusHub.Enabled = $false
  $statusRoom.Enabled = $false
  [void]$menu.Items.Add("-")
  $startItem = $menu.Items.Add("启动并挂载 Codex")
  $restartItem = $menu.Items.Add("同步热更新并重启注入")
  $tokenItem = $menu.Items.Add("复制协同口令")
  $hubItem = $menu.Items.Add("切换中枢地址")
  [void]$menu.Items.Add("-")
  $updateItem = $menu.Items.Add("检查更新")
  $exitItem = $menu.Items.Add("退出")
  $notify.ContextMenuStrip = $menu

  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 2500
  $timer.Add_Tick({
    $s = Invoke-Launcher "/api/status"
    if (-not $s) { return }
    $statusCodex.Text = if ($s.codex.injected) { "Codex: 已挂载" } elseif ($s.codex.running) { "Codex: 已打开" } else { "Codex: 未连接" }
    $statusHub.Text = if ($s.hub.ok) { "中枢: $($s.hub.lanUrl)" } else { "中枢: 未连接" }
    $statusRoom.Text = "房间: $($s.room.id)"
    if ($s.update.has_update) {
      $updateItem.Text = "发现新版本 $($s.update.latest) (点击升级)"
      $notify.Text = "TeamCodex 有更新"
    } else {
      $updateItem.Text = "当前版本 $($s.app_version) (点击检查更新)"
      $notify.Text = "TeamCodex 团队协作"
    }
  })

  $openPanelItem.Add_Click({
    Start-Process "$base/panel.html"
  })

  $startItem.Add_Click({ Invoke-Launcher "/api/start-codex" "POST" | Out-Null })
  $restartItem.Add_Click({
    Invoke-Launcher "/api/restart-inject" "POST" | Out-Null
    $notify.ShowBalloonTip(2000, "TeamCodex", "已拉取最新中枢脚本并重启注入", [System.Windows.Forms.ToolTipIcon]::Info)
  })
  $tokenItem.Add_Click({
    $data = Invoke-Launcher "/api/token"
    if ($data -and $data.token) {
      [System.Windows.Forms.Clipboard]::SetText($data.token)
      $notify.ShowBalloonTip(2500, "TeamCodex", "口令已复制到剪贴板", [System.Windows.Forms.ToolTipIcon]::Info)
    }
  })
  $hubItem.Add_Click({
    $s = Invoke-Launcher "/api/status"
    $current = if ($s) { $s.hub.url } else { "http://127.0.0.1:18765" }
    $input = [Microsoft.VisualBasic.Interaction]::InputBox("填写中枢地址", "TeamCodex", $current)
    if ($input) {
      $json = (@{ hub_url = $input } | ConvertTo-Json -Compress)
      Invoke-Launcher "/api/hub" "POST" $json | Out-Null
    }
  })
  $updateItem.Add_Click({
    $s = Invoke-Launcher "/api/update"
    if ($s -and $s.has_update) {
      $res = Invoke-Launcher "/api/update/download" "POST"
      $notify.ShowBalloonTip(4000, "TeamCodex 发现新版本", "正在为你打开最新安装包下载页面 (最新: $($s.latest))", [System.Windows.Forms.ToolTipIcon]::Info)
      if ($s.url) { Start-Process $s.url }
    } else {
      Invoke-Launcher "/api/restart-inject" "POST" | Out-Null
      $currentVer = if ($s -and $s.current) { "v$($s.current)" } else { "v1.1.0" }
      $notify.ShowBalloonTip(3500, "TeamCodex 检查更新", "当前底座已是最新版本 ($currentVer)，已同步刷新并加载中枢免重装热更新！", [System.Windows.Forms.ToolTipIcon]::Info)
    }
  })
  $exitItem.Add_Click({
    $notify.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  })

  $notify.Add_MouseClick({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
      Start-Process "$base/panel.html"
    }
  })
  $notify.Add_DoubleClick({
    Start-Process "$base/panel.html"
  })

  $timer.Start()
  $notify.ShowBalloonTip(2500, "TeamCodex", "已在托盘运行，左键单击打开控制面板，右键管理空间", [System.Windows.Forms.ToolTipIcon]::Info)
  [System.Windows.Forms.Application]::Run()
  $timer.Stop()
  $notify.Dispose()
}

Show-TeamCodexTray
