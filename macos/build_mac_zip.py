#!/usr/bin/env python3
"""
TeamCodex macOS 打包分发脚本
将必要组件打包为带执行权限的 TeamCodex-macOS.zip
"""

import os
from pathlib import Path
import stat
import tempfile
import zipfile

from build_dmg import build_app

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
OUTPUT_ZIP = os.path.join(TC_DIR, "TeamCodex-macOS.zip")

FILES_AND_DIRS = [
    ("启动TeamCodex.command", "TeamCodex-macOS/启动TeamCodex.command", 0o755),
    ("README.md", "TeamCodex-macOS/README.md", 0o644),
    ("macos/launch.sh", "TeamCodex-macOS/macos/launch.sh", 0o755),
    ("server/dev_host.mjs", "TeamCodex-macOS/server/dev_host.mjs", 0o644),
    ("server/workspace_store.mjs", "TeamCodex-macOS/server/workspace_store.mjs", 0o644),
    ("server/codex_runtime.mjs", "TeamCodex-macOS/server/codex_runtime.mjs", 0o644),
    ("server/codex_runtime_policy.mjs", "TeamCodex-macOS/server/codex_runtime_policy.mjs", 0o644),
    ("server/launch_context.mjs", "TeamCodex-macOS/server/launch_context.mjs", 0o644),
    ("server/runtime_identity.mjs", "TeamCodex-macOS/server/runtime_identity.mjs", 0o644),
    ("server/bootstrap_launcher.mjs", "TeamCodex-macOS/server/bootstrap_launcher.mjs", 0o644),
    ("server/workspace_validation.mjs", "TeamCodex-macOS/server/workspace_validation.mjs", 0o644),
    ("server/workspace_routes.mjs", "TeamCodex-macOS/server/workspace_routes.mjs", 0o644),
    ("server/workspace_bundle.mjs", "TeamCodex-macOS/server/workspace_bundle.mjs", 0o644),
    ("inject/workspace.js", "TeamCodex-macOS/inject/workspace.js", 0o644),
    ("inject/workspace.css", "TeamCodex-macOS/inject/workspace.css", 0o644),
    ("ui/workspace.html", "TeamCodex-macOS/ui/workspace.html", 0o644),
    ("ui/workspace_boot.js", "TeamCodex-macOS/ui/workspace_boot.js", 0o644),
    ("inject/sidebar_fullscreen.js", "TeamCodex-macOS/inject/sidebar_fullscreen.js", 0o644),
    ("inject/attach_codex.mjs", "TeamCodex-macOS/inject/attach_codex.mjs", 0o644),
    ("inject/host_adapter.mjs", "TeamCodex-macOS/inject/host_adapter.mjs", 0o644),
    ("inject/composer_appearance.js", "TeamCodex-macOS/inject/composer_appearance.js", 0o644),
    ("inject/cdp_websocket.mjs", "TeamCodex-macOS/inject/cdp_websocket.mjs", 0o644),
    ("inject/safety.mjs", "TeamCodex-macOS/inject/safety.mjs", 0o644),
    ("ui/index.html", "TeamCodex-macOS/ui/index.html", 0o644),
    ("ui/panel.html", "TeamCodex-macOS/ui/panel.html", 0o644),
    ("server/launcher_host.mjs", "TeamCodex-macOS/server/launcher_host.mjs", 0o644),
    ("macos/TeamCodex.swift", "TeamCodex-macOS/macos/TeamCodex.swift", 0o644),
    ("macos/TeamCodex-Status.png", "TeamCodex-macOS/macos/TeamCodex-Status.png", 0o644),
    ("macos/TeamCodex-Status@2x.png", "TeamCodex-macOS/macos/TeamCodex-Status@2x.png", 0o644),
    ("version.json", "TeamCodex-macOS/version.json", 0o644),
]


def add_file(z, src_path, zip_target, mode=None):
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Missing file: {src_path}")
    
    with open(src_path, "rb") as f:
        data = f.read()

    zinfo = zipfile.ZipInfo(zip_target)
    zinfo.create_system = 3  # Unix attributes, independent of the build host.
    permissions = stat.S_IMODE(os.stat(src_path).st_mode if mode is None else mode)
    # macOS ditto needs the regular-file type too; permission bits alone
    # are otherwise extracted as 0644, making apps and launchers unlaunchable.
    zinfo.external_attr = (stat.S_IFREG | permissions) << 16

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


def build_mac_zip(repo_root=TC_DIR, output_zip=None):
    output_zip = Path(output_zip) if output_zip else Path(repo_root) / Path(OUTPUT_ZIP).name
    print(f"[build_mac_zip] 打包中: {output_zip}...")
    with tempfile.TemporaryDirectory(prefix="teamcodex-mac-zip-") as temporary:
        app = build_app(Path(temporary) / "TeamCodex.app", repo_root)
        temp_zip = output_zip.with_suffix(".zip.tmp")
        with zipfile.ZipFile(temp_zip, "w") as z:
            for src_rel, zip_target, default_mode in FILES_AND_DIRS:
                add_file(z, Path(repo_root) / src_rel, zip_target, mode=default_mode)
            add_tree(z, app, "TeamCodex-macOS/TeamCodex.app")
        os.replace(temp_zip, output_zip)
    size_kb = output_zip.stat().st_size / 1024
    print(f"[build_mac_zip] 打包成功! 大小: {size_kb:.2f} KB -> {output_zip}")


if __name__ == "__main__":
    build_mac_zip()
