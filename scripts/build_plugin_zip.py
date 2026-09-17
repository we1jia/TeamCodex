#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TeamCodex 官方 Codex 插件自动化打包脚本
生成标准的 TeamCodex-Codex-Plugin.zip，可直接用于 Codex 客户端离线导入与 GitHub Releases 分发。
"""

import os
import sys
import zipfile

def build_plugin_zip():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_zip = os.path.join(repo_root, "TeamCodex-Codex-Plugin.zip")

    # 需要打包的白名单文件或目录
    include_entries = [
        ".codex-plugin",
        "hooks",
        "skills",
        "assets",
        "README.md",
    ]

    print(f"[build_plugin_zip] 正在打包 Codex 插件至: {output_zip} ...")

    file_count = 0
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for entry in include_entries:
            src_path = os.path.join(repo_root, entry)
            if not os.path.exists(src_path):
                print(f"[警告] 资源不存在，跳过: {src_path}")
                continue

            if os.path.isfile(src_path):
                zf.write(src_path, entry)
                file_count += 1
            elif os.path.isdir(src_path):
                for root, _, files in os.walk(src_path):
                    for file in files:
                        if file.startswith(".") and file != ".codex-plugin":
                            continue
                        if file.endswith((".pyc", ".DS_Store")):
                            continue
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, repo_root)
                        zf.write(full_path, rel_path)
                        file_count += 1

    size = os.path.getsize(output_zip)
    print(f"[build_plugin_zip] 打包成功! 共包含 {file_count} 个文件，大小: {size} 字节 ({size / 1024:.2f} KB) -> {output_zip}")
    return output_zip

if __name__ == "__main__":
    build_plugin_zip()
