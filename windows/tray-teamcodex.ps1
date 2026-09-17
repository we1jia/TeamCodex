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
  $notify.Text = "TeamCodex"
  $notify.Visible = $true

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
      $updateItem.Text = "发现新版本 $($s.update.latest)"
      $notify.Text = "TeamCodex 有更新"
    } else {
      $updateItem.Text = "当前版本 $($s.app_version)"
      $notify.Text = "TeamCodex"
    }
  })

  $startItem.Add_Click({ Invoke-Launcher "/api/start-codex" "POST" | Out-Null })
  $restartItem.Add_Click({ Invoke-Launcher "/api/restart-inject" "POST" | Out-Null })
  $tokenItem.Add_Click({
    $data = Invoke-Launcher "/api/token"
    if ($data -and $data.token) {
      [System.Windows.Forms.Clipboard]::SetText($data.token)
      $notify.ShowBalloonTip(2500, "TeamCodex", "口令已复制", [System.Windows.Forms.ToolTipIcon]::Info)
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
    $data = Invoke-Launcher "/api/update/download" "POST"
    if ($data -and $data.ok) {
      $notify.ShowBalloonTip(2500, "TeamCodex", "已打开更新页", [System.Windows.Forms.ToolTipIcon]::Info)
    }
  })
  $exitItem.Add_Click({
    $notify.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  })
  $notify.Add_DoubleClick({
    Invoke-Launcher "/api/start-codex" "POST" | Out-Null
  })

  $timer.Start()
  $notify.ShowBalloonTip(2500, "TeamCodex", "已在托盘运行，右键打开控制板", [System.Windows.Forms.ToolTipIcon]::Info)
  [System.Windows.Forms.Application]::Run()
  $timer.Stop()
  $notify.Dispose()
}

Show-TeamCodexTray
