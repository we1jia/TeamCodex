"""Keep release metadata consistent; all versions originate in version.json."""

import argparse
import json
from pathlib import Path
import plistlib
import re
import subprocess

VERSION_FILES = (
    "version.json", ".codex-plugin/plugin.json",
    "macos/TeamCodex.app/Contents/Info.plist", "windows/installer.nsi",
    "windows/tray-teamcodex.ps1", "server/launcher_host.mjs",
)
SEMVER = r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
TEXT_FIELDS = {
    "macos/TeamCodex.app/Contents/Info.plist": [
        r"(<key>CFBundleVersion</key>\s*<string>)[^<]+(</string>)",
        r"(<key>CFBundleShortVersionString</key>\s*<string>)[^<]+(</string>)",
    ],
    "windows/installer.nsi": [r'(!define APP_VERSION ")[^"]+(")'],
    "windows/tray-teamcodex.ps1": [r'(\$installedVersion = ")[^"]+(")'],
    "server/launcher_host.mjs": [r'(return String\(v\.version \|\| ")[^"]+("\);)'],
}


def parse_version(value):
    if not re.fullmatch(SEMVER, value):
        raise ValueError(f"Invalid release version: {value}")
    return tuple(map(int, value.split(".")))


def next_version(base, tags):
    candidate = parse_version(base)
    releases = [parse_version(tag[1:]) for tag in tags if re.fullmatch("v" + SEMVER, tag)]
    if not releases or candidate > max(releases):
        return base
    major, minor, patch = max(releases)
    return f"{major}.{minor}.{patch + 1}"


def apply(root, version):
    parse_version(version)
    pending = {}
    for relative in VERSION_FILES:
        content = (root / relative).read_text(encoding="utf-8")
        if relative.endswith(".json"):
            manifest = json.loads(content)
            manifest["version"] = version
            content = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        else:
            for pattern in TEXT_FIELDS[relative]:
                content, count = re.subn(pattern, lambda match: match[1] + version + match[2], content)
                if count != 1:
                    raise ValueError(f"Expected one version declaration in {relative}")
        pending[relative] = content
    # Validate every declaration before writing; preserve PowerShell's UTF-8 BOM.
    for relative, content in pending.items():
        (root / relative).write_text(content, encoding="utf-8")


def verify(root, tag):
    version = json.loads((root / "version.json").read_text())["version"]
    parse_version(version)
    if tag != "v" + version:
        raise ValueError(f"Tag {tag} does not match version.json v{version}")
    for relative, patterns in TEXT_FIELDS.items():
        content = (root / relative).read_text(encoding="utf-8")
        for pattern in patterns:
            matches = list(re.finditer(pattern, content))
            if len(matches) != 1 or matches[0][0] != matches[0][1] + version + matches[0][2]:
                raise ValueError(f"Version mismatch in {relative}")
    if json.loads((root / ".codex-plugin/plugin.json").read_text())["version"] != version:
        raise ValueError("Plugin version mismatch")
    plistlib.loads((root / "macos/TeamCodex.app/Contents/Info.plist").read_bytes())
    existing = subprocess.run(["git", "rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}"], cwd=root, capture_output=True, text=True)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if existing.returncode == 0 and existing.stdout.strip() != head:
        raise ValueError(f"Tag {tag} points to a different commit; refusing to replace release assets")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("tag")
    args = parser.parse_args()
    verify(Path(__file__).resolve().parents[1], args.tag)
