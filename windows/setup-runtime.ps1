# TeamCodex Windows Runtime Setup
# 架构自适应：支持 ARM64 (Mac 虚拟机/Surface) 与 AMD64/x64 (标准 PC)
$ErrorActionPreference = "Stop"

function Get-SystemArchitecture {
  $rawArch = $env:PROCESSOR_ARCHITECTURE
  $wowArch = $env:PROCESSOR_ARCHITEW6432
  if ($rawArch -eq "ARM64" -or $wowArch -eq "ARM64") {
    return "arm64"
  }
  return "x64"
}

function Find-InstalledNode {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c -PathType Leaf)) {
      return $c
    }
  }
  return $null
}

function Ensure-TeamCodexRuntime {
  param(
    [string]$TargetDir
  )
  $localRuntimeNode = Join-Path $TargetDir "runtime\node.exe"
  if (Test-Path -LiteralPath $localRuntimeNode -PathType Leaf) {
    return $localRuntimeNode
  }

  $systemNode = Find-InstalledNode
  if ($systemNode) {
    Write-Host "[TeamCodex] 检测到系统已安装 Node.js: $systemNode" -ForegroundColor Green
    return $systemNode
  }

  $arch = Get-SystemArchitecture
  Write-Host "==================================================" -ForegroundColor Cyan
  Write-Host "[TeamCodex] 正在准备便携免安装 Node.js 运行环境" -ForegroundColor Cyan
  Write-Host "[TeamCodex] 目标系统架构: Windows $arch" -ForegroundColor Yellow
  if ($arch -eq "arm64") {
    Write-Host "[TeamCodex] 当前为 ARM64 模式（适配 Mac 虚拟机 / Windows on ARM）" -ForegroundColor Green
  } else {
    Write-Host "[TeamCodex] 当前为 AMD64/x64 模式（适配标准 64 位 PC / 虚拟机）" -ForegroundColor Green
  }
  Write-Host "==================================================" -ForegroundColor Cyan

  $runtimeDir = Join-Path $TargetDir "runtime"
  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

  $nodeVer = "v20.18.0"
  $fileName = "node-$nodeVer-win-$arch.zip"
  
  # 优先国内高速镜像，备用官方源
  $urls = @(
    "https://npmmirror.com/mirrors/node/$nodeVer/$fileName",
    "https://nodejs.org/dist/$nodeVer/$fileName"
  )

  $zipPath = Join-Path $env:TEMP $fileName
  $downloadOk = $false

  foreach ($url in $urls) {
    Write-Host "[TeamCodex] 尝试从镜像下载便携运行时: $url"
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -TimeoutSec 120
      if ((Test-Path -LiteralPath $zipPath) -and ((Get-Item $zipPath).Length -gt 1048576)) {
        $downloadOk = $true
        Write-Host "[TeamCodex] 下载成功。" -ForegroundColor Green
        break
      }
    } catch {
      Write-Host "[TeamCodex] 镜像连接超时或失败，尝试下一个源..." -ForegroundColor Yellow
    }
  }

  if (-not $downloadOk) {
    throw "无法自动下载 Node.js 便携运行时。请检查虚拟机网络，或手动下载 Node.js $arch 安装包并安装。"
  }

  Write-Host "[TeamCodex] 正在解压运行时..." -ForegroundColor Cyan
  $extractTemp = Join-Path $env:TEMP "node_extract_$arch"
  if (Test-Path -LiteralPath $extractTemp) { Remove-Item -LiteralPath $extractTemp -Recurse -Force }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractTemp -Force

  $extractedFolder = Join-Path $extractTemp "node-$nodeVer-win-$arch"
  $extractedNodeExe = Join-Path $extractedFolder "node.exe"
  if (-not (Test-Path -LiteralPath $extractedNodeExe)) {
    $found = Get-ChildItem -LiteralPath $extractTemp -Filter "node.exe" -Recurse | Select-Object -First 1
    if ($found) { $extractedNodeExe = $found.FullName }
  }

  if (Test-Path -LiteralPath $extractedNodeExe) {
    Copy-Item -LiteralPath $extractedNodeExe -Destination $localRuntimeNode -Force
    Write-Host "[TeamCodex] 便携 Node.js ($arch) 就绪: $localRuntimeNode" -ForegroundColor Green
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extractTemp -Recurse -Force -ErrorAction SilentlyContinue
    return $localRuntimeNode
  } else {
    throw "解压后未找到 node.exe，请联系管理员或重试。"
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  Ensure-TeamCodexRuntime -TargetDir $PSScriptRoot
}
