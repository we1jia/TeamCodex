"""Exercise automatic releases against disposable local Git remotes, never GitHub."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import release_version
import prepare_release


class AutomaticReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="teamcodex-auto-release-")
        self.addCleanup(self.temp.cleanup)
        self.remote = Path(self.temp.name) / "remote.git"
        self.root = Path(self.temp.name) / "checkout"
        subprocess.run(["git", "init", "--bare", str(self.remote)], check=True, capture_output=True)
        self.root.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Release Test")
        self.git("config", "user.email", "release-test@example.invalid")
        for relative in release_version.VERSION_FILES:
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)
        release_version.apply(self.root, "1.2.0")
        self.git("add", ".")
        self.git("commit", "-m", "test: 初始版本")
        self.git("tag", "v1.2.0")
        self.git("remote", "add", "origin", str(self.remote))
        self.git("push", "origin", "main", "--tags")
        self.change("source.txt", "修复代码")
        self.source = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "main")

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args], text=True, stderr=subprocess.PIPE).strip()

    def change(self, name, text):
        (self.root / name).write_text(text)
        self.git("add", name)
        self.git("commit", "-m", "fix(test): 更新代码")

    def test_versions_increment_numerically_and_allow_explicit_major_minor(self):
        self.assertEqual(release_version.next_version("1.2.0", ["v1.2.9", "v1.2.10", "preview"]), "1.2.11")
        self.assertEqual(release_version.next_version("1.3.0", ["v1.2.10"]), "1.3.0")
        self.assertEqual(release_version.next_version("1.2.0", ["v2.0.0"]), "2.0.1")
        with self.assertRaises(ValueError):
            release_version.next_version("1.02.0", [])

    def test_push_creates_consistent_version_commit_and_tag_then_rerun_reuses_it(self):
        result = prepare_release.prepare(self.root, self.source)
        self.assertEqual(result["tag"], "v1.2.1")
        self.assertEqual(result["publish"], "true")
        self.assertEqual(self.git("rev-parse", "HEAD^"), self.source)
        self.assertIn("Release-Source: " + self.source, self.git("show", "-s", "--format=%B"))
        self.assertEqual(self.git("rev-parse", "v1.2.1"), result["sha"])
        self.assertTrue(self.git("ls-remote", "origin", "refs/heads/main").startswith(result["sha"]))
        self.assertEqual(self.git("status", "--porcelain"), "")
        release_version.verify(self.root, "v1.2.1")
        self.assertTrue((self.root / "windows/tray-teamcodex.ps1").read_bytes().startswith(b"\xef\xbb\xbf"))
        self.git("checkout", "--detach", self.source)
        self.assertEqual(prepare_release.prepare(self.root, self.source), result)

    def test_next_push_releases_next_patch_not_an_existing_tag(self):
        first = prepare_release.prepare(self.root, self.source)
        self.change("next.txt", "下一次推送")
        source = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "HEAD:main")
        second = prepare_release.prepare(self.root, source)
        self.assertEqual(second["tag"], "v1.2.2")
        self.assertEqual(self.git("rev-parse", first["tag"]), first["sha"])

    def test_stale_run_skips_without_rewriting_newer_main(self):
        self.change("newer.txt", "更新的推送")
        latest = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "main")
        self.git("checkout", "--detach", self.source)
        self.assertEqual(prepare_release.prepare(self.root, self.source)["publish"], "false")
        self.assertTrue(self.git("ls-remote", "origin", "refs/heads/main").startswith(latest))
        self.assertEqual(self.git("tag", "--list", "v1.2.1"), "")

    def test_atomic_push_rejects_racing_main_without_publishing_tag(self):
        original = prepare_release.git
        def race(root, *args):
            if args[:2] == ("push", "--atomic"):
                # Advance the disposable remote after the preflight, before the push.
                commit = self.git("commit-tree", self.git("rev-parse", self.source + "^{tree}"), "-p", self.source, "-m", "fix(test): 并发推送")
                self.git("push", "origin", commit + ":refs/heads/main")
            return original(root, *args)
        with patch.object(prepare_release, "git", side_effect=race):
            with self.assertRaises(subprocess.CalledProcessError):
                prepare_release.prepare(self.root, self.source)
        self.assertEqual(self.git("ls-remote", "origin", "refs/tags/v1.2.1"), "")

    def test_version_mismatch_fails_before_any_metadata_write(self):
        original = (self.root / "version.json").read_bytes()
        (self.root / "windows/installer.nsi").write_text("broken version declaration")
        with self.assertRaises(ValueError):
            release_version.apply(self.root, "1.2.1")
        self.assertEqual((self.root / "version.json").read_bytes(), original)

    def test_manual_tag_must_match_manifest_and_current_commit(self):
        with self.assertRaises(ValueError):
            release_version.verify(self.root, "v1.2.1")
        with self.assertRaises(ValueError):
            release_version.verify(self.root, "v1.2.0")

    def test_main_push_is_gated_by_tests_and_reusable_release_uses_exact_sha(self):
        ci = (ROOT / ".github/workflows/ci.yml").read_text()
        release = (ROOT / ".github/workflows/release.yml").read_text()
        self.assertIn("github.event_name == 'push' && github.ref == 'refs/heads/main'", ci)
        self.assertIn("needs: [test, windows-runtime]", ci)
        self.assertIn("uses: ./.github/workflows/release.yml", ci)
        self.assertIn("release_ref: ${{ needs.prepare-release.outputs.sha }}", ci)
        self.assertIn("workflow_call:", release)
        self.assertEqual(release.count("ref: ${{ inputs.release_ref || github.sha }}"), 4)
        self.assertIn("needs: [prepare, build-macos, build-windows]", release)


if __name__ == "__main__":
    unittest.main()
