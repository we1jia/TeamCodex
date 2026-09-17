#!/usr/bin/env python3
"""
TeamCodex macOS 打包分发脚本
将必要组件打包为带执行权限的 TeamCodex-macOS.zip
"""

import os
import stat
import zipfile

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
OUTPUT_ZIP = os.path.join(TC_DIR, "TeamCodex-macOS.zip")

FILES_AND_DIRS = [
    ("启动TeamCodex.command", "TeamCodex-macOS/启动TeamCodex.command", 0o755),
    ("README.md", "TeamCodex-macOS/README.md", 0o644),
    ("macos/launch.sh", "TeamCodex-macOS/macos/launch.sh", 0o755),
    ("macos/TeamCodex.app", "TeamCodex-macOS/TeamCodex.app", None),
    ("server/dev_host.mjs", "TeamCodex-macOS/server/dev_host.mjs", 0o644),
    ("inject/sidebar_fullscreen.js", "TeamCodex-macOS/inject/sidebar_fullscreen.js", 0o644),
    ("inject/attach_codex.mjs", "TeamCodex-macOS/inject/attach_codex.mjs", 0o644),
    ("inject/safety.mjs", "TeamCodex-macOS/inject/safety.mjs", 0o644),
    ("ui/index.html", "TeamCodex-macOS/ui/index.html", 0o644),
    ("data/hub_discovery.json", "TeamCodex-macOS/data/hub_discovery.json", 0o644),
]


def add_file(z, src_path, zip_target, mode=None):
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Missing file: {src_path}")
    
    with open(src_path, "rb") as f:
        data = f.read()

    zinfo = zipfile.ZipInfo(zip_target)
    if mode is None:
        st_mode = os.stat(src_path).st_mode
        zinfo.external_attr = (st_mode & 0xFFFF) << 16
    else:
        zinfo.external_attr = (mode & 0xFFFF) << 16

    z.writestr(zinfo, data, compress_type=zipfile.ZIP_DEFLATED)


def add_tree(z, src_dir, zip_target_dir):
    for root, dirs, files in os.walk(src_dir):
        rel_root = os.path.relpath(root, src_dir)
        target_dir = zip_target_dir if rel_root == "." else os.path.join(zip_target_dir, rel_root)
        for f in files:
            src_f = os.path.join(root, f)
            zip_f = os.path.join(target_dir, f)
            st_mode = os.stat(src_f).st_mode
            # 保持可执行权限
            mode = 0o755 if (st_mode & stat.S_IXUSR) else 0o644
            add_file(z, src_f, zip_f, mode=mode)


def build_mac_zip():
    print(f"[build_mac_zip] 打包中: {OUTPUT_ZIP}...")
    temp_zip = OUTPUT_ZIP + ".tmp"
    with zipfile.ZipFile(temp_zip, "w") as z:
        for item in FILES_AND_DIRS:
            src_rel, zip_target, default_mode = item
            src_full = os.path.join(TC_DIR, src_rel)
            if os.path.isdir(src_full):
                add_tree(z, src_full, zip_target)
            else:
                add_file(z, src_full, zip_target, mode=default_mode)
    os.replace(temp_zip, OUTPUT_ZIP)
    size_kb = os.path.getsize(OUTPUT_ZIP) / 1024
    print(f"[build_mac_zip] 打包成功! 大小: {size_kb:.2f} KB -> {OUTPUT_ZIP}")


if __name__ == "__main__":
    build_mac_zip()
