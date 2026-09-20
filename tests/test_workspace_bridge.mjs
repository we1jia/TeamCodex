import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('原生即时调用与轮询兜底共享同一 Promise，不重复写入', async () => {
  const source = fs.readFileSync(new URL('../inject/attach_codex.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const nativeRpcRequests = new Map();');
  const end = source.indexOf('function performNativeRpc', start);
  let calls = 0;
  const context = vm.createContext({ HOST_URL: 'http://isolated', performNativeRpc: async payload => { calls++; return { id: payload.id, ok: true }; } });
  vm.runInContext(source.slice(start, end) + '\nthis.rpc = executeNativeRpc;', context);
  const first = context.rpc({ id: 'request-1' });
  const duplicate = context.rpc({ id: 'request-1' });
  assert.equal(first, duplicate);
  await Promise.all([first, duplicate]);
  assert.equal(calls, 1);
  await context.rpc({ id: 'request-2' });
  assert.equal(calls, 2);
});

test('Windows 与 macOS 分发清单包含所有新模块，不生成或替换发布包', () => {
  const files = ['server/workspace_store.mjs', 'server/workspace_validation.mjs', 'server/workspace_routes.mjs', 'server/workspace_bundle.mjs', 'server/codex_runtime.mjs', 'server/codex_runtime_policy.mjs', 'inject/cdp_websocket.mjs', 'inject/workspace.js', 'inject/workspace.css', 'ui/workspace.html', 'ui/workspace_boot.js'];
  for (const script of ['../windows/build_zip.py', '../macos/build_mac_zip.py']) {
    const source = fs.readFileSync(new URL(script, import.meta.url), 'utf8');
    for (const file of files) assert.ok(source.includes(file), `${script} 缺少 ${file}`);
  }
});

test('旧 Hub 未加载工作区整包时，不热替换已安装的宿主界面', () => {
  const source = fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');
  const context = vm.createContext({ window: { __teamContextTabInstalled: true }, document: { getElementById: () => null } });
  const result = vm.runInContext(source, context);
  assert.equal(result.reason, 'awaiting-workspace-bundle');
});
