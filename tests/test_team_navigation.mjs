import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');
const functionSource = name => {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
};

test('菜单保留原生外侧4px间距，坐标不随DPR放大', () => {
  for (const devicePixelRatio of [1, 1.25, 1.5, 2]) {
    const context = vm.createContext({ window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio }, findSidebar: () => null });
    vm.runInContext(functionSource('teamMenuPosition') + '\nthis.position = teamMenuPosition;', context);
    const result = context.position({ right: 280, top: 180 });
    assert.equal(result.x, 284);
    assert.equal(result.y, 180);
    assert.equal(context.position({ right: 1270, top: 780 }).x, 1028);
    assert.equal(context.position({ right: 1270, top: 780 }).y, 568);
    assert.equal(context.position({ right: 0, top: 0 }).x, 264);
  }
});

test('菜单350ms容错：重入取消，鼠标或键盘仍在菜单内不关闭，离开才关闭', () => {
  const timers = new Map(); let sequence = 0; let closes = 0; let hovered = false; let focused = false;
  const menu = { matches: () => hovered || focused };
  const wrapper = { matches: () => false };
  const context = vm.createContext({
    MENU_ID: 'menu', TAB_ID: 'tab',
    document: { getElementById: id => id === 'menu' ? menu : wrapper },
    setTimeout: (callback, delay) => { timers.set(++sequence, { callback, delay }); return sequence; },
    clearTimeout: id => timers.delete(id), closeTeamMenu: () => closes++,
  });
  vm.runInContext(`let teamMenuHoverTimer = null; let teamMenuLeaveTimer = null;\n${functionSource('cancelTeamMenuTimers')}\n${functionSource('scheduleCloseTeamMenu')}\nthis.schedule = scheduleCloseTeamMenu; this.cancel = cancelTeamMenuTimers;`, context);
  const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(t => t.callback()); };
  context.schedule(); assert.equal([...timers.values()][0].delay, 350);
  context.cancel(); tick(); assert.equal(closes, 0);
  context.schedule(); hovered = true; tick(); assert.equal(closes, 0);
  hovered = false; focused = true; context.schedule(); tick(); assert.equal(closes, 0);
  focused = false; context.schedule(); tick(); assert.equal(closes, 1);
});

test('新全局 rail 的菜单紧贴图标栏，不误跳到第二列侧栏外', () => {
  const context = vm.createContext({ window: { innerWidth: 1280, innerHeight: 800,
    TeamCodexHost: { locate: () => ({ kind: 'rail', navigation: { getBoundingClientRect: () => ({ right: 56 }) } }) } },
    findSidebar: () => ({ getBoundingClientRect: () => ({ right: 296 }) }) });
  vm.runInContext(functionSource('teamMenuPosition') + '\nthis.position = teamMenuPosition;', context);
  assert.equal(context.position({ right: 46, top: 190 }).x, 60);
});

test('rail 鼠标点击不关闭悬停已打开的菜单，键盘和旧版仍可 toggle', () => {
  let menu = true, opens = 0, toggles = 0, cancels = 0, layout = 'rail';
  const button = { dataset: { teamHoverBound: 'true' }, setAttribute() {}, closest: () => ({ dataset: { hostLayout: layout } }) };
  const context = vm.createContext({ window: {}, TAB_ID: 'tab', MENU_ID: 'menu',
    document: { getElementById: () => menu }, cancelTeamMenuTimers: () => cancels++,
    openTeamMenu: () => opens++, toggleTeamMenu: () => toggles++ });
  vm.runInContext(functionSource('bindTeamButton') + '\nthis.bind = bindTeamButton;', context);
  context.bind(button);
  const event = { detail: 1, preventDefault() {}, stopPropagation() {} };
  button.onclick(event); assert.equal(opens, 0); assert.equal(toggles, 0); assert.equal(cancels, 1);
  menu = false; button.onclick(event); assert.equal(opens, 1);
  button.onclick({ ...event, detail: 0 }); assert.equal(toggles, 1);
  layout = 'legacy'; button.onclick(event); assert.equal(toggles, 2);
});

test('未知宿主无损收起页面，不清空草稿、不调用编辑框退出/保存', () => {
  const page = { style: {}, draft: '未发送', __requestWorkspaceLeave() { throw new Error('must preserve editor'); } };
  let restores = 0, active;
  const context = vm.createContext({ PAGE_ID: 'page', window: {},
    document: { getElementById: () => page, documentElement: { removeAttribute() {} }, body: { removeAttribute() {} } },
    setTabActive: value => { active = value; }, restoreNativeAppShellHeader: () => restores++ });
  vm.runInContext(functionSource('suspendHostPage') + '\nsuspendHostPage();', context);
  assert.equal(page.style.display, 'none'); assert.equal(page.style.visibility, 'hidden');
  assert.equal(page.draft, '未发送'); assert.equal(active, false); assert.equal(restores, 1);
});

test('对话顶栏四个入口复用工作区切换，不发送消息或创建新页面', () => {
  const markup = source.match(/<nav class="team-section-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(markup);
  for (const section of ['chat', 'knowledge', 'materials', 'kanban']) assert.ok(markup.includes(`data-team-section="${section}"`));
  const start = source.indexOf('    root.querySelectorAll(\'[data-team-section]\')');
  assert.ok(start >= 0);
  const end = source.indexOf('\n    });', start) + 8;
  const callbacks = new Map(); const calls = [];
  const context = vm.createContext({ root: { querySelectorAll: () => ['chat', 'knowledge', 'materials', 'kanban'].map(section => ({ dataset: { teamSection: section }, addEventListener: (type, fn) => callbacks.set(section, fn) })) }, page: { __showWorkspace: section => { calls.push(section); return false; } } });
  vm.runInContext(source.slice(start, end), context);
  for (const section of callbacks.keys()) callbacks.get(section)();
  assert.deepEqual(calls, ['chat', 'knowledge', 'materials', 'kanban']);
});

test('窄窗口按Team容器换行，菜单连接区只覆盖局部8px', () => {
  assert.match(source, /container: team-chat \/ inline-size/);
  assert.match(source, /@container team-chat \(max-width: 920px\)/);
  assert.match(source, /\.team-section-nav\s*\{[^}]*grid-row: 2/);
  assert.match(source, /\.team-codex-menu-wrapper::before\s*\{[^}]*left: -8px;[^}]*width: 8px;/);
  assert.match(source, /\.top \.pill-text\s*\{[^}]*text-overflow: ellipsis;[^}]*flex-shrink: 1 !important;/);
});

test('对话页和其它工作区保持同一导航顺序', () => {
  const workspace = fs.readFileSync(new URL('../inject/workspace.js', import.meta.url), 'utf8');
  assert.match(workspace, /const labels = \{ knowledge: '知识库', materials: '素材库', kanban: '看板' \}/);
  const markup = source.match(/<nav class="team-section-nav"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...markup.matchAll(/data-team-section="([^"]+)"/g)].map(match => match[1]), ['chat', 'knowledge', 'materials', 'kanban']);
});
