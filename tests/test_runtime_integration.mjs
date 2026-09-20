import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { splitArguments } from '../server/codex_runtime.mjs';
import { createLaunchController, chooseRuntime } from '../server/codex_runtime_policy.mjs';

const source = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Windows 路径和双引号参数完整保留', () => {
  assert.deepEqual(splitArguments('"C:\\Program Files\\Codex\\Codex.exe" --user-data-dir="C:\\My Profile" --remote-debugging-port "9333"', true), ['C:\\Program Files\\Codex\\Codex.exe', '--user-data-dir=C:\\My Profile', '--remote-debugging-port', '9333']);
  assert.throws(() => splitArguments('"unclosed', true), /解析/);
});

test('后台观察器没有启动、强杀或孤儿监听器清理入口，重新检查每个目标', () => {
  const code = source('inject/attach_codex.mjs');
  assert.doesNotMatch(code, /launchCodexWithCdp|pkill|kill -9|bare-modifier-monitor|spawn\(/);
  assert.match(code, /inspectRuntime\(\{ resolveInstalled: false \}\)/);
  assert.match(code, /fingerprint\(latest.target\) !== identity/);
  assert.match(code, /pendingUpdate: action === 'defer'/);
});

test('Windows 引导保持托盘/互斥，受控重启不递归调用引导脚本', () => {
  const bootstrap = source('windows/run-teamcodex.ps1');
  assert.match(bootstrap, /Local\\TeamCodexAppMutex/);
  assert.match(bootstrap, /Local\\TeamCodexTrayMutex/);
  assert.doesNotMatch(bootstrap, /Stop-ProcessGracefully|Stop-Process -Id .* -Force|Start-Process -FilePath \$codexExe/);
  const launcher = source('server/launcher_host.mjs');
  assert.doesNotMatch(launcher, /run-teamcodex\.ps1|pkill|bare-modifier-monitor/);
  assert.match(launcher, /createLaunchController/);
  const tray = source('windows/tray-teamcodex.ps1');
  assert.match(tray, /requires_restart_confirm -and \$result.confirmToken/);
  assert.match(tray, /DialogResult\]::Yes/);
  assert.match(tray, /confirmToken = \$result.confirmToken/);
  assert.doesNotMatch(tray, /Get-NetTCPConnection|force\s*=\s*\$true/);
});

test('旧界面热加载不覆盖原生输入区，也不重新打开隐藏页面', () => {
  const code = source('inject/sidebar_fullscreen.js');
  const existing = { hidden: true };
  const context = vm.createContext({ window: { TeamWorkspace: {}, __teamContextTabInstalled: true, __teamContextUiVersion: 'inline-v97' }, document: { getElementById: () => existing } });
  const result = vm.runInContext(code, context);
  assert.equal(result.pendingUpdate, true);
  assert.equal(result.reason, 'client-reopen-required');
  assert.equal(existing.hidden, true);
  assert.doesNotMatch(code, /existing\.remove\(\);\s*openPage\(\)/);
});

test('控制面取消后再次点击仅重新检查，不携带上次确认；确认才提交一次票据', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, textContent: '', value: '', hidden: true, disabled: false, style: {}, classList: { add() {}, remove() {} }, matches: () => false, after() {} });
    return elements.get(id);
  };
  const requests = [];
  const context = vm.createContext({
    document: { getElementById: element, createElement: () => ({ style: {}, setAttribute() {}, hidden: true }) },
    window: { addEventListener() {} }, setInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    fetch: async (url, options) => {
      if (url === '/api/start-codex') {
        const body = JSON.parse(options.body); requests.push(body);
        return { json: async () => body.confirmToken ? { ok: true, message: '等待挂载' } : { requires_restart_confirm: true, confirmToken: 'ticket', message: '目标 PID 12' } };
      }
      return { json: async () => ({ app_version: '1', codex: { running: true, injected: false }, hub: {}, room: {}, update: {} }) };
    },
  });
  vm.runInContext(source('ui/panel.html').match(/<script>([\s\S]*?)<\/script>/)[1], context);
  await element('startBtn').onclick();
  element('launch-confirm-cancel').onclick();
  assert.equal(element('startBtn').disabled, false);
  await element('startBtn').onclick();
  assert.deepEqual(requests, [{}, {}]);
  await element('launch-confirm-accept').onclick();
  assert.deepEqual(requests[2], { confirmToken: 'ticket' });
  await element('launch-confirm-accept').onclick();
  assert.equal(requests.length, 3);
});

test('没有客户端时允许独立 Windows 经确认启动；重复提交与过期确认被拒绝', async () => {
  let at = 0, launches = 0, finish;
  const controller = createLaunchController({ inspect: async () => ({ ...chooseRuntime([]), availablePath: 'C:\\Codex\\Codex.exe', managed: false }), launch: async () => { launches++; await new Promise(resolve => finish = resolve); }, restart: async () => { throw Error('不能走重启'); }, attach: async () => {}, now: () => at });
  const expired = await controller.request({}); at = 61000;
  await assert.rejects(controller.request({ confirmToken: expired.confirmToken }), /失效/);
  const pending = await controller.request({});
  const execution = controller.request({ confirmToken: pending.confirmToken });
  await Promise.resolve();
  await assert.rejects(controller.request({ confirmToken: pending.confirmToken }), /进行中/);
  finish(); await execution;
  assert.equal(launches, 1);
});
