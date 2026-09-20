import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchController, isCodexDesktop, debugPort, launchArguments, chooseRuntime, hotUpdateDecision } from '../server/codex_runtime_policy.mjs';

const processInfo = (pid = 12, port = null) => ({ pid, path: 'C:\\Program Files\\Codex\\Codex.exe', startedAt: '2026-09-20T10:00:00Z', args: port ? [`--remote-debugging-port=${port}`] : [] });
test('精确识别桌面主进程，TeamCodex、CLI 和 helper 不算 Codex', () => {
  assert.equal(isCodexDesktop('/Applications/TeamCodex.app/Contents/MacOS/TeamCodex'), false);
  assert.equal(isCodexDesktop('/Applications/ChatGPT.app/Contents/Resources/codex'), false);
  assert.equal(isCodexDesktop('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'), true);
  assert.equal(isCodexDesktop('C:\\Program Files\\Codex\\Codex.exe'), true);
  assert.equal(isCodexDesktop('C:\\Codex\\Codex.exe', ['--type=renderer']), false);
});
test('支持 Windows 分离参数，端口必须有效且保留原启动参数', () => {
  assert.equal(debugPort(['--remote-debugging-port', '9333']), 9333);
  assert.equal(debugPort(['--remote-debugging-port=70000']), null);
  assert.deepEqual(launchArguments(['--user-data-dir=C:\\My Profile', '--remote-debugging-port=9000'], 9444), ['--user-data-dir=C:\\My Profile', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9444']);
});
test('连接失效或多实例时等待，不猜测目标；热更新不擅自打开界面', () => {
  assert.equal(chooseRuntime([processInfo(12), processInfo(13)]).state, 'ambiguous');
  assert.equal(chooseRuntime([processInfo(12)], 0).state, 'restart_required');
  assert.equal(hotUpdateDecision({ installed: true, currentVersion: 'v96', nextVersion: 'v97', allowUpdate: false }), 'defer');
  assert.equal(hotUpdateDecision({ installed: true, currentVersion: 'v96', nextVersion: 'v97', allowUpdate: true }), 'replace_preserving_visibility');
});
test('已有可用 CDP 只挂载；没有通道的 Windows 必须确认后定点重启', async () => {
  let state = { ...chooseRuntime([processInfo()]), managed: false, availablePath: processInfo().path };
  const calls = [];
  const controller = createLaunchController({ inspect: async () => state, restart: async target => calls.push(['restart', target.pid]), launch: async target => calls.push(['launch', target.path]), attach: async () => calls.push(['attach']) });
  const pending = await controller.request({});
  assert.equal(pending.requires_restart_confirm, true);
  assert.deepEqual(calls, []);
  await controller.request({ confirmToken: pending.confirmToken });
  assert.deepEqual(calls, [['restart', 12], ['attach']]);
  await assert.rejects(controller.request({ confirmToken: pending.confirmToken }), /失效/);
  state = { ...state, state: 'ready', target: processInfo(12, 9333) };
  await controller.request({});
  assert.deepEqual(calls.at(-1), ['attach']);
});
test('确认绑定 PID/启动时间/参数；切号后旧确认失效；受管实例不可绕过', async () => {
  let state = { ...chooseRuntime([processInfo()]), managed: false, availablePath: processInfo().path };
  let writes = 0;
  const controller = createLaunchController({ inspect: async () => state, restart: async () => writes++, launch: async () => writes++, attach: async () => {} });
  const pending = await controller.request({});
  state = { ...state, target: processInfo(14) };
  await assert.rejects(controller.request({ confirmToken: pending.confirmToken }), /变化/);
  assert.equal(writes, 0);
  state = { ...state, managed: true };
  assert.equal((await controller.request({ force: true })).mode, 'managed');
  assert.equal(writes, 0);
});
test('优雅关闭失败不继续启动，控制面明确失败而不是假报成功', async () => {
  let launches = 0;
  const state = { ...chooseRuntime([processInfo()]), managed: false, availablePath: processInfo().path };
  const controller = createLaunchController({ inspect: async () => state, restart: async () => { throw new Error('关闭超时'); }, launch: async () => launches++, attach: async () => launches++ });
  const pending = await controller.request({});
  await assert.rejects(controller.request({ confirmToken: pending.confirmToken }), /关闭超时/);
  assert.equal(launches, 0);
});
