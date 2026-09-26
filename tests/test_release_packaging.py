"""Release assembly tests; native builds are mocked, macOS ZIP extraction is real."""

import json
from pathlib import Path
import plistlib
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

MACOS = Path(__file__).resolve().parents[1] / "macos"
sys.path.insert(0, str(MACOS))
import build_dmg
import build_mac_zip


class MacReleasePackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="teamcodex-packaging-test-")
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        for relative in build_dmg.APP_FILES:
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(f"current:{relative}".encode())
        for relative, _, _ in build_mac_zip.FILES_AND_DIRS:
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(f"current:{relative}".encode())
        (self.root / "version.json").write_text(json.dumps({"version": "1.2.0"}))
        template = self.root / "macos/TeamCodex.app/Contents"
        (template / "Resources/app/data").mkdir(parents=True)
        (template / "Resources/app/data/private.json").write_text("PRIVATE")
        (template / "Resources/app/data-directory.txt").write_text("/private/user-data")
        (template / "MacOS").mkdir()
        (template / "MacOS/TeamCodex").write_text("OLD-BINARY")
        (template / "Resources/AppIcon.icns").write_bytes(b"ICON")
        with (template / "Info.plist").open("wb") as stream:
            plistlib.dump({"CFBundleName": "TeamCodex", "CFBundleVersion": "1.1.1",
                          "CFBundleShortVersionString": "1.1.1"}, stream)
        (self.root / "data").mkdir()
        (self.root / "data/hub_discovery.json").write_text('{"private":"SECRET"}')

    def native_tool(self, command, **kwargs):
        if command[0] == "swiftc":
            Path(command[command.index("-o") + 1]).write_bytes(b"NEW-NATIVE-BINARY")
        return None

    @patch.object(build_dmg.subprocess, "run")
    def test_app_is_fresh_versioned_self_contained_and_private_data_free(self, run):
        run.side_effect = self.native_tool
        target = self.root / "output/TeamCodex.app"
        build_dmg.build_app(target, repo_root=self.root)
        contents = target / "Contents"
        with (contents / "Info.plist").open("rb") as stream:
            info = plistlib.load(stream)
        self.assertEqual(info["CFBundleVersion"], "1.2.0")
        self.assertEqual(info["CFBundleShortVersionString"], "1.2.0")
        self.assertEqual((contents / "MacOS/TeamCodex").read_bytes(), b"NEW-NATIVE-BINARY")
        for relative in build_dmg.APP_FILES:
            self.assertEqual((contents / "Resources/app" / relative).read_bytes(),
                             (self.root / relative).read_bytes(), relative)
        self.assertFalse((contents / "Resources/app/data").exists())
        self.assertFalse((contents / "Resources/app/data-directory.txt").exists())
        compile_command = run.call_args_list[0].args[0]
        self.assertTrue(compile_command[compile_command.index("-target") + 1].endswith("-apple-macosx13.0"))
        self.assertEqual(run.call_args_list[-1].args[0][:4], ["codesign", "--force", "--sign", "-"])

    @patch.object(build_dmg.subprocess, "run")
    def test_zip_embeds_new_app_and_identical_runtime(self, run):
        run.side_effect = self.native_tool
        archive = self.root / "release.zip"
        build_mac_zip.build_mac_zip(repo_root=self.root, output_zip=archive)
        base = "TeamCodex-macOS/"
        embedded = base + "TeamCodex.app/Contents/Resources/app/"
        with zipfile.ZipFile(archive) as bundle:
            names = bundle.namelist()
            self.assertFalse(any("/data/" in name or name.endswith("data-directory.txt") for name in names))
            self.assertEqual(bundle.read(base + "TeamCodex.app/Contents/MacOS/TeamCodex"), b"NEW-NATIVE-BINARY")
            for relative in build_dmg.APP_FILES:
                self.assertEqual(bundle.read(embedded + relative), bundle.read(base + relative), relative)
            binary = bundle.getinfo(base + "TeamCodex.app/Contents/MacOS/TeamCodex")
            self.assertEqual(binary.create_system, 3)
            self.assertTrue(stat.S_ISREG(binary.external_attr >> 16))
            self.assertTrue((binary.external_attr >> 16) & 0o111)
            info = plistlib.loads(bundle.read(base + "TeamCodex.app/Contents/Info.plist"))
            self.assertEqual(info["CFBundleVersion"], "1.2.0")

    def test_zip_file_modes_include_unix_regular_file_type(self):
        source = self.root / "README.md"
        source.chmod(0o640)
        archive = self.root / "modes.zip"
        with zipfile.ZipFile(archive, "w") as bundle:
            for name, mode in (("default", None), ("script", 0o755), ("resource", 0o644)):
                build_mac_zip.add_file(bundle, source, name, mode=mode)
        with zipfile.ZipFile(archive) as bundle:
            for name, mode in (("default", 0o640), ("script", 0o755), ("resource", 0o644)):
                info = bundle.getinfo(name)
                self.assertEqual(info.create_system, 3, name)
                self.assertTrue(stat.S_ISREG(info.external_attr >> 16), name)
                self.assertEqual(stat.S_IMODE(info.external_attr >> 16), mode, name)

    @unittest.skipUnless(sys.platform == "darwin", "requires macOS ditto")
    def test_ditto_extraction_preserves_all_entrypoint_execute_permissions(self):
        archive = self.root / "release.zip"
        with patch.object(build_dmg.subprocess, "run", side_effect=self.native_tool):
            build_mac_zip.build_mac_zip(repo_root=self.root, output_zip=archive)
        extracted = self.root / "extracted"
        subprocess.run(["/usr/bin/ditto", "-x", "-k", str(archive), str(extracted)],
                       check=True, capture_output=True)
        base = extracted / "TeamCodex-macOS"
        for relative in (
            "启动TeamCodex.command",
            "macos/launch.sh",
            "TeamCodex.app/Contents/MacOS/TeamCodex",
            "TeamCodex.app/Contents/Resources/app/macos/launch.sh",
        ):
            self.assertEqual(stat.S_IMODE((base / relative).stat().st_mode), 0o755, relative)
        self.assertEqual(stat.S_IMODE((base / "README.md").stat().st_mode), 0o644)

    @patch.object(build_dmg.subprocess, "run")
    def test_missing_runtime_fails_closed(self, run):
        (self.root / "inject/cdp_websocket.mjs").unlink()
        with self.assertRaises(FileNotFoundError):
            build_dmg.build_app(self.root / "output/TeamCodex.app", repo_root=self.root)
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
