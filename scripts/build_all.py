#!/usr/bin/env python3
"""
TeamCodex 全平台一键自动化打包分发脚本
构建全套分发产物：
  1. TeamCodex-macOS.zip (macOS 免安装绿色压缩包)
  2. TeamCodex-macOS.dmg (macOS 官方原生 DMG 镜像安装包)
  3. TeamCodex-Windows-arm64-amd64.zip (Windows 免安装绿色压缩包)
  4. TeamCodex-Codex-Plugin.zip (官方 Codex 插件离线分发包)
"""

import hashlib
import os
import subprocess
import sys
import time

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def calc_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def format_size(size_bytes):
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"

def run_step(desc, cmd):
    print(f"\n🚀 [{desc}] 正在执行...")
    t0 = time.time()
    res = subprocess.run(cmd, cwd=REPO_ROOT, shell=True)
    if res.returncode != 0:
        print(f"❌ [{desc}] 失败，退出码: {res.returncode}")
        sys.exit(res.returncode)
    cost = time.time() - t0
    print(f"✅ [{desc}] 完成 (耗时: {cost:.2f}s)")

def main():
    print("=" * 60)
    print("📦 TeamCodex 全平台自动化打包分发流水线")
    print("=" * 60)

    # 1. macOS Zip 构建
    run_step("构建 macOS 免安装压缩包 (TeamCodex-macOS.zip)", "python3 macos/build_mac_zip.py")

    # 2. macOS 原生 DMG 镜像构建
    run_step("构建 macOS 原生 DMG 安装镜像 (TeamCodex-macOS.dmg)", "python3 macos/build_dmg.py")

    # 3. Windows 跨平台包构建
    run_step("构建 Windows 免安装分发包 (TeamCodex-Windows-arm64-amd64.zip)", "python3 windows/build_zip.py")

    # 4. Codex 插件离线包构建
    run_step("构建 Codex 插件离线包 (TeamCodex-Codex-Plugin.zip)", "python3 scripts/build_plugin_zip.py")

    # 产物汇总与校验
    artifacts = [
        "TeamCodex-macOS.zip",
        "TeamCodex-macOS.dmg",
        "TeamCodex-Windows-arm64-amd64.zip",
        "TeamCodex-Codex-Plugin.zip",
    ]

    print("\n" + "=" * 60)
    print("🎉 打包全量完成！产物清单与校验：")
    print("=" * 60)
    for name in artifacts:
        path = os.path.join(REPO_ROOT, name)
        if os.path.exists(path):
            sz = os.path.getsize(path)
            sha = calc_sha256(path)
            print(f"📦 {name:<35} | {format_size(sz):>10} | SHA256: {sha[:16]}...{sha[-8:]}")
        else:
            print(f"⚠️ {name:<35} | 未找到产物")
    print("=" * 60)

if __name__ == "__main__":
    main()
