#!/usr/bin/env python3
import os
import zipfile

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..'))
WORKSPACE = os.path.abspath(os.path.join(TC_DIR, '..'))
OUTPUT_ZIP = os.path.join(TC_DIR, 'TeamCodex-Windows-arm64-amd64.zip')
OUTPUT_ZIP_PARENT = os.path.join(WORKSPACE, 'TeamCodex-Windows-arm64-amd64.zip')

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
    ('inject/run_isolated.mjs', 'TeamCodex-Windows/inject/run_isolated.mjs'),
    ('inject/attach_codex.mjs', 'TeamCodex-Windows/inject/attach_codex.mjs'),
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
    ('windows/启动TeamCodex(无黑框静默).vbs', 'TeamCodex-Windows/windows/启动TeamCodex(无黑框静默).vbs'),
    ('windows/mock-codex-host.html', 'TeamCodex-Windows/windows/mock-codex-host.html'),
    ('windows/assets/TeamCodex.ico', 'TeamCodex-Windows/windows/assets/TeamCodex.ico'),
    ('windows/assets/TeamContext.ico', 'TeamCodex-Windows/windows/assets/TeamContext.ico'),
    ('data/hub_discovery.json', 'TeamCodex-Windows/data/hub_discovery.json'),
]

def build_zip():
    print(f'[build_zip] 打包中: {OUTPUT_ZIP}...')
    temp_zip = OUTPUT_ZIP + '.tmp'
    with zipfile.ZipFile(temp_zip, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for src_rel, zip_target in FILES_TO_PACK:
            src_full = os.path.join(TC_DIR, src_rel)
            if not os.path.exists(src_full):
                raise FileNotFoundError(f'Missing: {src_full}')
            z.write(src_full, zip_target)
    os.replace(temp_zip, OUTPUT_ZIP)
    if os.path.exists(WORKSPACE) and WORKSPACE != TC_DIR:
        try:
            import shutil
            shutil.copy2(OUTPUT_ZIP, OUTPUT_ZIP_PARENT)
        except Exception:
            pass
    print(f'[build_zip] 打包成功! 大小: {os.path.getsize(OUTPUT_ZIP)} 字节')

if __name__ == '__main__':
    build_zip()
