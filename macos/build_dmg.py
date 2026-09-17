#!/usr/bin/env python3
"""
TeamCodex macOS DMG 打包生成器
将 TeamCodex 打包为自包含独立 .app 并生成可拖拽安装到 /Applications 的 .dmg 文件
"""

import os
import shutil
import stat
import subprocess
import sys

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
BUILD_DIR = os.path.join(TC_DIR, "dist_macos")
DMG_STAGING = os.path.join(BUILD_DIR, "dmg_staging")
OUTPUT_DMG = os.path.join(TC_DIR, "TeamCodex-macOS.dmg")


def ensure_permissions(path):
    for root, dirs, files in os.walk(path):
        for f in files:
            p = os.path.join(root, f)
            if f in ["TeamCodex", "launch.sh"] or f.endswith(".command") or f.endswith(".sh"):
                os.chmod(p, 0o755)


def build_dmg():
    print(f"[build_dmg] 正在准备构建 macOS 原生应用与 DMG 镜像...")
    
    # 清理并创建临时构建目录
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    os.makedirs(DMG_STAGING, exist_ok=True)

    # 1. 复制 TeamCodex.app 模板
    app_src = os.path.join(TC_DIR, "macos", "TeamCodex.app")
    app_target = os.path.join(DMG_STAGING, "TeamCodex.app")
    print(f"[build_dmg] 复制 App 结构到: {app_target}")
    shutil.copytree(app_src, app_target, symlinks=True)

    # 2. 注入自包含内部资源库 Contents/Resources/app
    app_res = os.path.join(app_target, "Contents", "Resources", "app")
    os.makedirs(app_res, exist_ok=True)

    copy_items = [
        ("server", True),
        ("inject", True),
        ("ui", True),
        ("macos/launch.sh", False),
        ("macos/TeamCodex.swift", False),
        ("macos/TeamCodex-Status.png", False),
        ("macos/TeamCodex-Status@2x.png", False),
        ("data/hub_discovery.json", False),
        ("version.json", False),
        ("README.md", False),
    ]

    for item, is_dir in copy_items:
        src = os.path.join(TC_DIR, item)
        dst = os.path.join(app_res, item)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if is_dir:
            shutil.copytree(src, dst, dirs_exist_ok=True)
        elif os.path.exists(src):
            shutil.copy2(src, dst)

    # 将状态栏图标放置在 App Bundle 的 Resources 根目录下以便 NSImage(named:) 直接命中
    res_root = os.path.join(app_target, "Contents", "Resources")
    for icon_name in ["TeamCodex-Status.png", "TeamCodex-Status@2x.png"]:
        src_icon = os.path.join(TC_DIR, "macos", icon_name)
        if os.path.exists(src_icon):
            shutil.copy2(src_icon, os.path.join(res_root, icon_name))

    # 3. 编译菜单栏客户端，替换 bash 占位可执行文件
    swift_src = os.path.join(TC_DIR, "macos", "TeamCodex.swift")
    binary = os.path.join(app_target, "Contents", "MacOS", "TeamCodex")
    print("[build_dmg] 编译 macOS 菜单栏客户端...")
    compile = subprocess.run(
        ["swiftc", "-O", swift_src, "-o", binary, "-framework", "Cocoa", "-framework", "WebKit"],
        capture_output=True,
        text=True,
    )
    if compile.returncode != 0:
        print(compile.stdout)
        print(compile.stderr, file=sys.stderr)
        sys.exit(compile.returncode)

    # 4. 赋予可执行文件 755 权限
    ensure_permissions(app_target)

    # 5. 创建 /Applications 快捷软链接以实现开箱即拖拽安装
    apps_symlink = os.path.join(DMG_STAGING, "Applications")
    if not os.path.exists(apps_symlink):
        try:
            os.symlink("/Applications", apps_symlink)
        except OSError:
            pass

    # 5. 调用 hdiutil 制作压缩 DMG 镜像
    if os.path.exists(OUTPUT_DMG):
        os.remove(OUTPUT_DMG)

    print(f"[build_dmg] 正在压制 UDZO 格式的 DMG 安装镜像: {OUTPUT_DMG}")
    cmd = [
        "/usr/bin/hdiutil",
        "create",
        "-volname", "TeamCodex",
        "-srcfolder", DMG_STAGING,
        "-ov",
        "-format", "UDZO",
        OUTPUT_DMG
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[build_dmg] 错误: hdiutil 失败:\n{res.stderr}", file=sys.stderr)
        sys.exit(res.returncode)

    size_mb = os.path.getsize(OUTPUT_DMG) / (1024 * 1024)
    print(f"[build_dmg] DMG 构建成功! 文件大小: {size_mb:.2f} MB -> {OUTPUT_DMG}")

    # 清理构建临时目录
    shutil.rmtree(BUILD_DIR)


if __name__ == "__main__":
    build_dmg()
