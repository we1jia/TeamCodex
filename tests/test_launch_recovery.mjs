import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLaunchController } from '../server/codex_runtime_policy.mjs';

const target = { pid: 42, path: '/fixture/Codex.exe', args: [], startedAt: 'original' };
const fixture = (initial = {}) => {
  let state = { state: 'restart_required', target, availablePath: target.path, managed: true, ...initial };
  let stamp = 'configuration-A';
  const calls = [];
  const controller = createLaunchController({
    inspect: async () => state,
    prepare: async snapshot => ({ stamp, target: snapshot.target, env: { CUSTOM_PROXY: 'private-value' } }),
    restart: async (...args) => calls.push(['restart', ...args]),
    launch: async (...args) => calls.push(['launch', ...args]), attach: async () => calls.push(['attach']),
  });
  return { controller, calls, setState: value => state = { ...state, ...value }, changeConfig: () => stamp = 'configuration-B' };
};

test('是否存在辅助软件不再阻止确认启动；准备好的环境只在服务端传递', async () => {
  for (const state of ['not_running', 'restart_required', 'connection_failed']) {
    const f = fixture({ state, target: state === 'not_running' ? null : target });
    const pending = await f.controller.request({});
    assert.equal(pending.requires_restart_confirm, true);
    assert.doesNotMatch(JSON.stringify(pending), /private-value|CUSTOM_PROXY|managed|代理管理/);
    await f.controller.request({ confirmToken: pending.confirmToken });
    assert.equal(f.calls[0][0], state === 'not_running' ? 'launch' : 'restart');
    assert.equal(f.calls[0][2].env.CUSTOM_PROXY, 'private-value');
  }
});

test('确认期间切号或配置变化必须取消，不能关闭现有实例', async () => {
  const f = fixture();
  const pending = await f.controller.request({});
  f.changeConfig();
  await assert.rejects(f.controller.request({ confirmToken: pending.confirmToken }), /变化/);
  assert.equal(f.calls.length, 0);
});

test('读取不到启动环境时给出明确阻塞原因，不发出重启票据', async () => {
  const controller = createLaunchController({ inspect: async () => ({ state: 'restart_required', target, availablePath: target.path }), prepare: async () => { throw Error('无法完整读取启动环境'); }, restart: async () => assert.fail(), launch: async () => assert.fail(), attach: async () => assert.fail() });
  const result = await controller.request({});
  assert.equal(result.mode, 'manual');
  assert.match(result.message, /启动环境/);
});

test('普通用户可见文案不提其他工具，版本号不拼接长构建标识', () => {
  const policy = fs.readFileSync(new URL('../server/codex_runtime_policy.mjs', import.meta.url), 'utf8');
  const panel = fs.readFileSync(new URL('../ui/panel.html', import.meta.url), 'utf8');
  assert.doesNotMatch(policy, /外部账号\/代理管理环境|snapshot.managed/);
  assert.doesNotMatch(panel, /textContent = "v"[^\n]*s.build_id/);
  assert.match(panel, /重新挂载/);
});
