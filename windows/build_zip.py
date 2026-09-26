#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
import tempfile
import zipfile

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..'))
OUTPUT_ZIP = os.path.join(TC_DIR, 'TeamCodex-Windows-arm64-amd64.zip')
SAFE_DISCOVERY = {"default_room": "1024", "rooms": {}, "known_keys": {}}

FILES_TO_PACK = [
    ('windows/一键安装到桌面.cmd', 'TeamCodex-Windows/一键安装到桌面.cmd'),
    ('windows/install.cmd', 'TeamCodex-Windows/install.cmd'),
    ('windows/启动测试模式.cmd', 'TeamCodex-Windows/启动测试模式.cmd'),
    ('windows/启动TeamCodex.cmd', 'TeamCodex-Windows/启动TeamCodex.cmd'),
    ('windows/启动TeamCodex(无黑框静默).vbs', 'TeamCodex-Windows/启动TeamCodex(无黑框静默).vbs'),
    ('windows/run-test.cmd', 'TeamCodex-Windows/run-test.cmd'),
    ('windows/run-silent.vbs', 'TeamCodex-Windows/run-silent.vbs'),
    ('README.md', 'TeamCodex-Windows/README.md'),
    ('server/dev_host.mjs', 'TeamCodex-Windows/server/dev_host.mjs'),
    ('server/workspace_store.mjs', 'TeamCodex-Windows/server/workspace_store.mjs'),
    ('server/codex_runtime.mjs', 'TeamCodex-Windows/server/codex_runtime.mjs'),
    ('server/codex_runtime_policy.mjs', 'TeamCodex-Windows/server/codex_runtime_policy.mjs'),
    ('server/launch_context.mjs', 'TeamCodex-Windows/server/launch_context.mjs'),
    ('server/runtime_identity.mjs', 'TeamCodex-Windows/server/runtime_identity.mjs'),
    ('server/bootstrap_launcher.mjs', 'TeamCodex-Windows/server/bootstrap_launcher.mjs'),
    ('windows/read-process-context.ps1', 'TeamCodex-Windows/windows/read-process-context.ps1'),
    ('server/workspace_validation.mjs', 'TeamCodex-Windows/server/workspace_validation.mjs'),
    ('server/workspace_routes.mjs', 'TeamCodex-Windows/server/workspace_routes.mjs'),
    ('server/workspace_bundle.mjs', 'TeamCodex-Windows/server/workspace_bundle.mjs'),
    ('inject/workspace.js', 'TeamCodex-Windows/inject/workspace.js'),
    ('inject/workspace.css', 'TeamCodex-Windows/inject/workspace.css'),
    ('ui/workspace.html', 'TeamCodex-Windows/ui/workspace.html'),
    ('ui/workspace_boot.js', 'TeamCodex-Windows/ui/workspace_boot.js'),
    ('inject/run_isolated.mjs', 'TeamCodex-Windows/inject/run_isolated.mjs'),
    ('inject/attach_codex.mjs', 'TeamCodex-Windows/inject/attach_codex.mjs'),
    ('inject/host_adapter.mjs', 'TeamCodex-Windows/inject/host_adapter.mjs'),
    ('inject/composer_appearance.js', 'TeamCodex-Windows/inject/composer_appearance.js'),
    ('inject/verify_native_smoke.mjs', 'TeamCodex-Windows/inject/verify_native_smoke.mjs'),
    ('inject/cdp_websocket.mjs', 'TeamCodex-Windows/inject/cdp_websocket.mjs'),
    ('inject/sidebar_fullscreen.js', 'TeamCodex-Windows/inject/sidebar_fullscreen.js'),
    ('inject/inspect_theme.mjs', 'TeamCodex-Windows/inject/inspect_theme.mjs'),
    ('inject/seed_native_fixture.mjs', 'TeamCodex-Windows/inject/seed_native_fixture.mjs'),
    ('inject/safety.mjs', 'TeamCodex-Windows/inject/safety.mjs'),
    ('ui/index.html', 'TeamCodex-Windows/ui/index.html'),
    ('windows/install-teamcodex.ps1', 'TeamCodex-Windows/windows/install-teamcodex.ps1'),
    ('windows/run-silent.vbs', 'TeamCodex-Windows/windows/run-silent.vbs'),
    ('windows/setup-runtime.ps1', 'TeamCodex-Windows/windows/setup-runtime.ps1'),
    ('windows/run-test.ps1', 'TeamCodex-Windows/windows/run-test.ps1'),
    ('windows/install-test.cmd', 'TeamCodex-Windows/windows/install-test.cmd'),
    ('windows/README.md', 'TeamCodex-Windows/windows/README.md'),
    ('windows/install-test.ps1', 'TeamCodex-Windows/windows/install-test.ps1'),
    ('windows/run-test.cmd', 'TeamCodex-Windows/windows/run-test.cmd'),
    ('windows/一键安装到桌面.cmd', 'TeamCodex-Windows/windows/一键安装到桌面.cmd'),
    ('windows/启动测试模式.cmd', 'TeamCodex-Windows/windows/启动测试模式.cmd'),
    ('windows/启动TeamCodex.cmd', 'TeamCodex-Windows/windows/启动TeamCodex.cmd'),
    ('windows/run-teamcodex.ps1', 'TeamCodex-Windows/windows/run-teamcodex.ps1'),
    ('windows/tray-teamcodex.ps1', 'TeamCodex-Windows/windows/tray-teamcodex.ps1'),
    ('windows/退出TeamCodex.cmd', 'TeamCodex-Windows/windows/退出TeamCodex.cmd'),
    ('windows/退出TeamCodex.cmd', 'TeamCodex-Windows/退出TeamCodex.cmd'),
    ('server/launcher_host.mjs', 'TeamCodex-Windows/server/launcher_host.mjs'),
    ('ui/panel.html', 'TeamCodex-Windows/ui/panel.html'),
    ('version.json', 'TeamCodex-Windows/version.json'),
    ('windows/启动TeamCodex(无黑框静默).vbs', 'TeamCodex-Windows/windows/启动TeamCodex(无黑框静默).vbs'),
    ('windows/mock-codex-host.html', 'TeamCodex-Windows/windows/mock-codex-host.html'),
    ('windows/assets/TeamCodex.ico', 'TeamCodex-Windows/windows/assets/TeamCodex.ico'),
    ('windows/assets/TeamContext.ico', 'TeamCodex-Windows/windows/assets/TeamContext.ico'),
    ('windows/assets/TeamCodex.png', 'TeamCodex-Windows/windows/assets/TeamCodex.png'),
    ('windows/assets/TeamCodex-32.png', 'TeamCodex-Windows/windows/assets/TeamCodex-32.png'),
    ('assets/icon.png', 'TeamCodex-Windows/assets/icon.png'),
]

def build_zip(*, repo_root=None, output_zip=None):
    root = Path(repo_root or TC_DIR).resolve()
    output = Path(output_zip) if output_zip else root / Path(OUTPUT_ZIP).name
    output = output.resolve()
    sources = []
    for src_rel, zip_target in FILES_TO_PACK:
        source = root / src_rel
        if not source.is_file():
            raise FileNotFoundError(f'Missing: {source}')
        if source.is_symlink() or not source.resolve().is_relative_to(root):
            raise ValueError(f'Release source must be a regular repository file: {source}')
        sources.append((source, zip_target))

    output.parent.mkdir(parents=True, exist_ok=True)
    print(f'[build_zip] 打包中: {output}...')
    with tempfile.NamedTemporaryFile(prefix=f'.{output.name}.', suffix='.tmp', dir=output.parent, delete=False) as temporary:
        temp_zip = Path(temporary.name)
    try:
        with zipfile.ZipFile(temp_zip, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
            for source, zip_target in sources:
                bundle.write(source, zip_target)
            # 仅提供无账号、无密钥、无设备地址的默认发现文件，绝不读取真实data目录。
            bundle.writestr('TeamCodex-Windows/data/hub_discovery.json', json.dumps(SAFE_DISCOVERY, indent=2) + '\n')
        os.replace(temp_zip, output)
    finally:
        temp_zip.unlink(missing_ok=True)
    print(f'[build_zip] 打包成功! 大小: {output.stat().st_size} 字节')
    return output

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Package the Windows runtime without local data or parent-directory copies.')
    parser.add_argument('--output', type=Path, help='Write only to this archive path; defaults to the repository root.')
    args = parser.parse_args()
    build_zip(output_zip=args.output)
