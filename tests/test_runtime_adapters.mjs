import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { isCodexDesktop, debugPort, launchArguments, chooseRuntime, fingerprint } from '../server/codex_runtime_policy.mjs';

function windowsFixture({ refusesClose = false, switchDuringClose = false } = {}) {
  const executable = 'C:\\Program Files\\Codex\\Codex.exe';
  let processes = [{ pid: 71, name: 'Codex.exe', path: executable, command: `"${executable}" --user-data-dir="C:\\My Profile"`, startedAt: 'first' }];
  const calls = [];
  const context = vm.createContext({
    process: { platform: 'win32', env: {} }, path: path.win32, os: { homedir: () => 'C:\\Users\\test' },
    isCodexDesktop, debugPort, launchArguments, chooseRuntime, fingerprint,
    fs: { existsSync: () => true, readFileSync: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } },
    execFileSync: (file, args) => {
      const script = args.at(-1);
      if (script.includes('Get-CimInstance')) return JSON.stringify(processes);
      if (script.includes('CloseMainWindow')) {
        calls.push({ type: 'close', script });
        if (refusesClose) return 'False';
        processes = switchDuringClose ? [{ ...processes[0], pid: 99, startedAt: 'switch' }] : [];
        return 'True';
      }
      if (script.includes('Get-NetTCPConnection')) return JSON.stringify(processes[0]?.pid);
      throw Error('不允许未预期的系统调用 ' + file);
    },
    spawn: (file, args) => {
      calls.push({ type: 'spawn', file, args: [...args] });
      processes = [{ pid: 72, name: 'Codex.exe', path: file, command: `"${file}" ` + args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' '), startedAt: 'second' }];
      const child = { once: (event, fn) => { if (event === 'spawn') queueMicrotask(fn); return child; }, unref() {} };
      return child;
    },
    net: { createServer: () => ({ on() {}, listen: (port, host, fn) => fn(), address: () => ({ port: 9333 }), close: fn => fn() }) },
    fetch: async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/browser/test' }) }),
    AbortSignal, setTimeout: fn => { queueMicrotask(fn); return 1; }, URL,
  });
  const code = fs.readFileSync(new URL('../server/codex_runtime.mjs', import.meta.url), 'utf8')
    .replace(/^import .+;\n/gm, '').replace(/^export /gm, '').replace('fileURLToPath(import.meta.url)', "'C:/fixture/server/codex_runtime.mjs'");
  vm.runInContext(code + '\nthis.runtime = { codexProcesses, restartDesktop, gracefulClose };', context);
  return { calls, runtime: context.runtime };
}

test('Windows 平台适配器：定点关闭后保留 profile 参数、启动并验证新端口（系统调用替身）', async () => {
  const { runtime, calls } = windowsFixture();
  await runtime.restartDesktop(runtime.codexProcesses()[0]);
  assert.equal(calls.filter(call => call.type === 'close').length, 1);
  assert.match(calls[0].script, /Get-Process -Id 71 /);
  assert.equal(calls.filter(call => call.type === 'spawn').length, 1);
  assert.deepEqual(calls[1].args, ['--user-data-dir=C:\\My Profile', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9333']);
});

test('Windows 平台适配器：退出被拒绝不强杀，切号产生新 PID 时不重复启动（系统调用替身）', async () => {
  for (const options of [{ refusesClose: true }, { switchDuringClose: true }]) {
    const { runtime, calls } = windowsFixture(options);
    await assert.rejects(runtime.restartDesktop(runtime.codexProcesses()[0]), /退出|新.*实例/);
    assert.equal(calls.some(call => call.type === 'spawn'), false);
    assert.equal(calls.some(call => /Stop-Process|taskkill|pkill/.test(call.script || '')), false);
  }
});
