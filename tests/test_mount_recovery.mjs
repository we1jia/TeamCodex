import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');

const legacyPage = ({ workspace = false, recover = true } = {}) => {
  const elements = new Map();
  const observers = [];
  const timers = [];
  let installs = 0;
  const window = { __teamContextTabInstalled: true, __teamContextUiVersion: 'inline-v97' };
  if (workspace) window.TeamWorkspace = {};
  if (recover) window.__teamContextInstall = () => {
    installs++;
    elements.set('team-context-sidebar-tab', { isConnected: true });
    return { installed: true };
  };
  const body = {};
  const context = vm.createContext({ window, document: {
    body, getElementById: id => elements.get(id), querySelector: () => ({}),
  }, MutationObserver: class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }, setTimeout: fn => { timers.push(fn); return timers.length; } });
  return { context, window, elements, observers, timers, body, installs: () => installs };
};

test('旧标记不能证明挂载成功：没有入口也没有恢复函数时如实失败', () => {
  const fixture = legacyPage({ recover: false });
  const result = vm.runInContext(source, fixture.context);
  assert.equal(result.installed, false);
  assert.equal(result.reason, 'awaiting-workspace-bundle');
});

test('旧 Hub 缺少工作区包时仍恢复消失的入口，不替换现有界面函数', () => {
  const fixture = legacyPage();
  const originalInstall = fixture.window.__teamContextInstall;
  const result = vm.runInContext(source, fixture.context);
  assert.equal(result.installed, true);
  assert.equal(fixture.installs(), 1);
  assert.equal(fixture.window.__teamContextInstall, originalInstall);
  assert.equal(fixture.window.__teamContextUiVersion, 'inline-v97');
});

test('整包就绪但旧 UI 尚在使用时，恢复入口、保留隐藏页面和版本', () => {
  const fixture = legacyPage({ workspace: true });
  const page = { hidden: true, draft: 'unsent' };
  fixture.elements.set('team-context-fullscreen-page', page);
  const result = vm.runInContext(source, fixture.context);
  assert.equal(result.installed, true);
  assert.equal(result.pendingUpdate, true);
  assert.equal(fixture.installs(), 1);
  assert.equal(page.hidden, true);
  assert.equal(page.draft, 'unsent');
  assert.equal(fixture.window.__teamContextUiVersion, 'inline-v97');
});

test('监听稳定根节点：侧栏整体重建后仍恢复，普通消息变化不重复挂载', () => {
  const fixture = legacyPage();
  vm.runInContext(source, fixture.context);
  const observer = fixture.observers.at(-1);
  assert.equal(observer.target, fixture.body);
  observer.callback();
  assert.equal(fixture.timers.length, 0);
  fixture.elements.delete('team-context-sidebar-tab');
  observer.callback(); observer.callback();
  assert.equal(fixture.timers.length, 1);
  fixture.timers.shift()();
  assert.equal(fixture.installs(), 2);
});

test('恢复失败不得伪报成功，保留再次恢复机会', () => {
  const fixture = legacyPage();
  fixture.window.__teamContextInstall = () => { throw new Error('navigation replaced'); };
  const result = vm.runInContext(source, fixture.context);
  assert.equal(result.installed, false);
  assert.equal(result.recoveryError, 'navigation replaced');
  assert.ok(fixture.observers.length);
});
