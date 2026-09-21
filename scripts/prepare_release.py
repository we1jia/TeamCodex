"""Prepare one release per tested main push, without force pushes or token recursion."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess

from release_version import VERSION_FILES, apply, next_version


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()


def resumed_release(root, source, current):
    message = git(root, "show", "-s", "--format=%B", current)
    if f"Release-Source: {source}" not in message.splitlines():
        return None
    if git(root, "rev-parse", current + "^") != source:
        return None
    version = json.loads(git(root, "show", current + ":version.json"))["version"]
    tag = "v" + version
    if git(root, "rev-parse", f"refs/tags/{tag}^{{commit}}") != current:
        raise ValueError("Release tag and version commit disagree")
    return {"publish": "true", "tag": tag, "sha": current}


def prepare(root, source):
    if not re.fullmatch(r"[a-f0-9]{40}", source):
        raise ValueError("Expected a full tested commit SHA")
    if git(root, "status", "--porcelain"):
        raise ValueError("Release preparation requires a clean checkout")
    git(root, "fetch", "origin", "refs/heads/main:refs/remotes/origin/main", "--tags")
    current = git(root, "rev-parse", "refs/remotes/origin/main")
    previous = resumed_release(root, source, current)
    if previous:
        return previous
    if current != source:
        print("A newer main push exists; this stale run will not publish.")
        return {"publish": "false", "tag": "", "sha": ""}
    if git(root, "rev-parse", "HEAD") != source:
        raise ValueError("Checkout does not match the tested source commit")
    base = json.loads((root / "version.json").read_text())["version"]
    version = next_version(base, git(root, "tag", "--list").splitlines())
    tag = "v" + version
    apply(root, version)
    git(root, "add", "--", *VERSION_FILES)
    git(root, "-c", "user.name=github-actions[bot]", "-c",
        "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "commit", "--allow-empty", "-m", f"chore(release): 自动发布 {tag}",
        "-m", f"Release-Source: {source}")
    sha = git(root, "rev-parse", "HEAD")
    git(root, "tag", tag, sha)
    # GITHUB_TOKEN pushes do not trigger another push workflow. The CI explicitly
    # calls the reusable release workflow with this immutable SHA instead.
    git(root, "push", "--atomic", "origin", f"{sha}:refs/heads/main", f"refs/tags/{tag}")
    return {"publish": "true", "tag": tag, "sha": sha}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    result = prepare(Path(__file__).resolve().parents[1], args.source)
    print(json.dumps(result))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.writelines(f"{key}={value}\n" for key, value in result.items())
