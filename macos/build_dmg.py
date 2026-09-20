#!/usr/bin/env python3
"""Build a fresh, self-contained macOS app and its drag-to-install DMG."""

import json
from pathlib import Path
import platform
import plistlib
import shutil
import subprocess
import tempfile

TC_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DMG = TC_DIR / "TeamCodex-macOS.dmg"

# Both macOS formats use this allowlist; never copy a developer's app/data tree.
APP_FILES = (
    "server/dev_host.mjs",
    "server/launcher_host.mjs",
    "server/codex_runtime.mjs",
    "server/codex_runtime_policy.mjs",
    "server/workspace_store.mjs",
    "server/workspace_validation.mjs",
    "server/workspace_routes.mjs",
    "server/workspace_bundle.mjs",
    "inject/attach_codex.mjs",
    "inject/cdp_websocket.mjs",
    "inject/safety.mjs",
    "inject/sidebar_fullscreen.js",
    "inject/workspace.js",
    "inject/workspace.css",
    "ui/index.html",
    "ui/panel.html",
    "ui/workspace.html",
    "ui/workspace_boot.js",
    "macos/launch.sh",
    "macos/TeamCodex.swift",
    "macos/TeamCodex-Status.png",
    "macos/TeamCodex-Status@2x.png",
    "version.json",
    "README.md",
)


def copy_file(source, target):
    if source.is_symlink() or not source.is_file():
        raise FileNotFoundError(f"Missing regular release file: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def build_app(app_target, repo_root=TC_DIR):
    """Assemble from source, without reusing stale binaries or machine settings."""
    repo_root, app_target = Path(repo_root), Path(app_target)
    app_target.mkdir(parents=True, exist_ok=False)
    contents = app_target / "Contents"
    resources = contents / "Resources"
    for relative in APP_FILES:
        copy_file(repo_root / relative, resources / "app" / relative)

    template = repo_root / "macos/TeamCodex.app/Contents"
    with (template / "Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    version = json.loads((repo_root / "version.json").read_text())["version"]
    info.update(CFBundleVersion=version, CFBundleShortVersionString=version)
    with (contents / "Info.plist").open("wb") as stream:
        plistlib.dump(info, stream)
    copy_file(template / "Resources/AppIcon.icns", resources / "AppIcon.icns")
    for icon in ("TeamCodex-Status.png", "TeamCodex-Status@2x.png"):
        copy_file(repo_root / "macos" / icon, resources / icon)

    binary = contents / "MacOS/TeamCodex"
    binary.parent.mkdir(parents=True, exist_ok=True)
    target = f"{platform.machine()}-apple-macosx{info.get('LSMinimumSystemVersion', '13.0')}"
    subprocess.run([
        "swiftc", "-O", str(repo_root / "macos/TeamCodex.swift"), "-o", str(binary),
        "-target", target,
        "-framework", "Cocoa", "-framework", "WebKit",
    ], check=True)
    binary.chmod(0o755)
    (resources / "app/macos/launch.sh").chmod(0o755)
    # Re-sign the freshly compiled bundle; copying the template signature is invalid.
    subprocess.run(["codesign", "--force", "--sign", "-", str(app_target)], check=True)
    return app_target


def build_dmg(repo_root=TC_DIR, output_dmg=None):
    repo_root = Path(repo_root)
    output_dmg = Path(output_dmg) if output_dmg else repo_root / OUTPUT_DMG.name
    with tempfile.TemporaryDirectory(prefix="teamcodex-dmg-") as temporary:
        staging = Path(temporary) / "staging"
        staging.mkdir()
        build_app(staging / "TeamCodex.app", repo_root)
        (staging / "Applications").symlink_to("/Applications")
        subprocess.run([
            "/usr/bin/hdiutil", "create", "-volname", "TeamCodex",
            "-srcfolder", str(staging), "-ov", "-format", "UDZO", str(output_dmg),
        ], check=True)
    size_mb = output_dmg.stat().st_size / (1024 * 1024)
    print(f"[build_dmg] DMG 构建成功: {size_mb:.2f} MB -> {output_dmg}")


if __name__ == "__main__":
    build_dmg()
