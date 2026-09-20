"""Windows release assembly tests; never launch the tray, Codex, or installer."""

import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("windows_release_zip", ROOT / "windows/build_zip.py")
build_zip = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_zip)


class WindowsReleasePackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="teamcodex-windows-release-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / "checkout"
        for relative, _ in build_zip.FILES_TO_PACK:
            source = self.root / relative
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(f"current:{relative}".encode())
        (self.root / "version.json").write_text(json.dumps({"version": "1.2.0"}))
        for relative in ["data/hub_discovery.json", "data/workspace.json", "data/workspace-blobs/private.bin", "data-directory.txt", "windows/data-directory.txt", "windows/user-notes.txt", "server/private-state.json"]:
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("PRIVATE-LOCAL-SENTINEL")

    def test_zip_contains_only_allowlisted_code_and_synthetic_discovery(self):
        output = self.root / "output/release.zip"
        result = build_zip.build_zip(repo_root=self.root, output_zip=output)
        self.assertEqual(result, output)
        with zipfile.ZipFile(output) as bundle:
            expected = {target for _, target in build_zip.FILES_TO_PACK}
            expected.add("TeamCodex-Windows/data/hub_discovery.json")
            self.assertEqual(set(bundle.namelist()), expected)
            self.assertEqual(json.loads(bundle.read("TeamCodex-Windows/version.json")), {"version": "1.2.0"})
            self.assertEqual(json.loads(bundle.read("TeamCodex-Windows/data/hub_discovery.json")), {"default_room": "1024", "rooms": {}, "known_keys": {}})
            self.assertFalse(any(name.endswith("data-directory.txt") for name in bundle.namelist()))
            for name in bundle.namelist():
                self.assertNotIn(b"PRIVATE-LOCAL-SENTINEL", bundle.read(name), name)

    def test_default_output_stays_inside_selected_checkout_not_parent(self):
        result = build_zip.build_zip(repo_root=self.root)
        self.assertEqual(result.parent, self.root)
        self.assertFalse((self.root.parent / result.name).exists())
        self.assertEqual(sorted(path.name for path in self.root.parent.iterdir()), ["checkout"])

    def test_missing_dependency_preserves_existing_archive_and_fails_before_writing(self):
        output = self.root / "prior.zip"
        output.write_bytes(b"EXISTING-ARCHIVE")
        (self.root / "inject/cdp_websocket.mjs").unlink()
        with self.assertRaises(FileNotFoundError):
            build_zip.build_zip(repo_root=self.root, output_zip=output)
        self.assertEqual(output.read_bytes(), b"EXISTING-ARCHIVE")
        self.assertFalse(list(output.parent.glob(".prior.zip.*.tmp")))

    def test_source_symlinks_cannot_leak_local_data_into_program_paths(self):
        source = self.root / "inject/cdp_websocket.mjs"
        source.unlink()
        source.symlink_to(self.root / "data/workspace.json")
        with self.assertRaises(ValueError):
            build_zip.build_zip(repo_root=self.root)
        self.assertFalse((self.root / Path(build_zip.OUTPUT_ZIP).name).exists())

    def test_failed_archive_write_cleans_temporary_file_and_keeps_previous_release(self):
        output = self.root / "prior.zip"
        output.write_bytes(b"EXISTING-ARCHIVE")
        with patch.object(zipfile.ZipFile, "write", side_effect=OSError("simulated disk failure")):
            with self.assertRaises(OSError):
                build_zip.build_zip(repo_root=self.root, output_zip=output)
        self.assertEqual(output.read_bytes(), b"EXISTING-ARCHIVE")
        self.assertFalse(list(output.parent.glob(".prior.zip.*.tmp")))

    def test_installer_and_zip_ship_same_required_runtime_without_recursive_data_copy(self):
        installer = (ROOT / "windows/installer.nsi").read_text(encoding="utf-8-sig")
        self.assertNotRegex(installer, r"(?m)^\s*File\s+/r\b")
        files = {path.replace("\\", "/") for path in re.findall(r'^\s*File\s+"\.\.\\([^"\n]+)"\s*$', installer, re.MULTILINE)}
        self.assertEqual(files, {relative for relative, _ in build_zip.FILES_TO_PACK})
        self.assertFalse(any(path.startswith("data/") or path.endswith("data-directory.txt") for path in files))
        self.assertIn('CreateDirectory "$INSTDIR\\data"', installer)
        for relative in ["version.json", "inject/cdp_websocket.mjs", "inject/workspace.js", "inject/workspace.css", "server/codex_runtime.mjs", "server/codex_runtime_policy.mjs", "server/workspace_bundle.mjs", "ui/workspace_boot.js"]:
            self.assertIn(relative, files)
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_version_fields_use_release_constant_and_local_manifest_not_service_identity(self):
        installer = (ROOT / "windows/installer.nsi").read_text(encoding="utf-8-sig")
        tray = (ROOT / "windows/tray-teamcodex.ps1").read_text(encoding="utf-8-sig")
        self.assertIn('!define APP_VERSION "1.2.0"', installer)
        self.assertIn('"DisplayVersion" "${APP_VERSION}"', installer)
        self.assertIn('$installedVersion = "1.2.0"', tray)
        self.assertIn('"version.json"', tray)
        self.assertIn('$installedVersion = [string]$manifest.version', tray)
        self.assertNotIn('v1.1.5', tray)
        self.assertIn('$verLabel.Text = "v$installedVersion"', tray)
        self.assertIn('服务待同步', tray)
        self.assertTrue((ROOT / "windows/tray-teamcodex.ps1").read_bytes().startswith(b"\xef\xbb\xbf"))


if __name__ == "__main__":
    unittest.main()
