import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHostAdapter, hostAdapterBootstrap } from '../inject/host_adapter.mjs';

// 仅为适配器支持的简单选择器提供 DOM 替身；另用真实浏览器夹具交叉验证。
class Node {
  constructor(tag, attrs = {}, bounds = {}) {
    this.tag = tag; this.attrs = attrs; this.children = []; this.parentElement = null;
    this.style = { display: 'block', visibility: 'visible', opacity: '1' };
    this.bounds = { left: 0, top: 0, width: 40, height: 40, ...bounds };
    this.textContent = ''; this.dataset = {};
  }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  getBoundingClientRect() { const b = this.bounds; return { ...b, right: b.left + b.width, bottom: b.top + b.height }; }
  matches(selector) {
    return selector.split(',').some(part => {
      const s = part.trim(), tag = s.match(/^[a-z]+/)?.[0];
      if (tag && tag !== this.tag) return false;
      const id = s.match(/#([\w-]+)/)?.[1];
      if (id && this.attrs.id !== id) return false;
      const cls = s.match(/\.([\w-]+)/)?.[1];
      if (cls && !(this.attrs.class || '').split(' ').includes(cls)) return false;
      return [...s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, name, value]) =>
        name in this.attrs && (value === undefined || String(this.attrs[name]) === value));
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function fixture({ kind = 'rail', collapsed = false, dpr = 1, platform = 'MacIntel' } = {}) {
  const document = new Node('document'); document.documentElement = { clientWidth: 1200, clientHeight: 800 };
  const frame = new Node('div', { 'data-app-shell-frame': 'true' }, { width: 1200, height: 800 });
  const titlebar = new Node('header', { 'data-app-shell-titlebar': 'true' }, { width: 1200, height: 44 });
  const rail = new Node('nav', { 'data-app-navigation-rail': 'true' }, { top: 44, width: 56, height: 756 });
  const group = new Node('div', {}, { width: 56, height: 300 });
  const home = new Node('button', { 'data-sidebar-destination': 'home' });
  const plugins = new Node('button', { 'data-sidebar-destination': 'plugins' });
  group.append(home, plugins); rail.append(group);
  const sidebar = new Node('aside', { class: 'app-shell-left-panel' }, { left: kind === 'rail' ? 56 : 0, top: 44, width: 240, height: 756 });
  const navigation = new Node('nav', { role: 'navigation' });
  const legacyButton = new Node('button', { 'aria-label': '新聊天' }); navigation.append(legacyButton); sidebar.append(navigation);
  if (collapsed) sidebar.style.display = 'none';
  const main = new Node('main', { 'data-app-shell-main-surface': 'default' }, { left: collapsed ? 56 : 296, top: 44, width: collapsed ? 1144 : 904, height: 756 });
  if (kind === 'rail') frame.append(titlebar, rail, sidebar, main); else frame.append(sidebar, main);
  document.append(frame);
  const window = { innerWidth: 1200, innerHeight: 800, devicePixelRatio: dpr, getComputedStyle: node => node.style };
  const host = createHostAdapter(document, window); window.TeamCodexHost = host;
  return { document, window, host, frame, titlebar, rail, group, home, plugins, sidebar, main, navigation, legacyButton, platform };
}

test('新版按明确 rail 标记定位，不把第二列项目导航当成全局入口', () => {
  const f = fixture(), h = f.host.locate();
  assert.equal(h.kind, 'rail'); assert.equal(h.parent, f.group); assert.equal(h.anchor, f.plugins);
  assert.equal(h.main, f.main); assert.equal(h.sidebar, f.sidebar);
});

for (const platform of ['MacIntel', 'Win32']) for (const dpr of [1, 1.25, 1.5]) {
  test(`${platform} ${dpr * 100}%：双层导航和标题栏均避让，坐标不二次缩放`, () => {
    const f = fixture({ platform, dpr });
    assert.deepEqual(f.host.pageBounds(), { left: 296, top: 44, right: 0, bottom: 0, width: 904, height: 756, sidebarCollapsed: false });
    f.titlebar.bounds.height = 52;
    assert.equal(f.host.pageBounds().top, 52);
    assert.equal(f.host.pageBounds().height, 748);
  });
}

test('折叠第二列仍保留全局 rail；重新展开按当前几何恢复', () => {
  const f = fixture({ collapsed: true });
  assert.equal(f.host.pageBounds().left, 56);
  f.sidebar.style.display = 'block'; f.main.bounds.left = 296; f.main.bounds.width = 904;
  assert.equal(f.host.pageBounds().left, 296);
});

test('尊重主内容区右侧面板和底部边界', () => {
  const f = fixture(); f.main.bounds.width = 700; f.main.bounds.height = 700;
  assert.equal(f.host.pageBounds().right, 204); assert.equal(f.host.pageBounds().bottom, 56);
});

test('新版多候选/缺少主面板拒绝挂载，不回退到恰好存在的旧 nav', () => {
  const f = fixture();
  f.frame.append(new Node('nav', { 'data-app-navigation-rail': true }));
  assert.equal(f.host.describe().reason, 'ambiguous-navigation-rail');
  f.frame.children.pop(); f.main.style.display = 'none';
  assert.equal(f.host.describe().reason, 'main-surface-missing');
  assert.equal(f.host.pageBounds(), null);
});

test('隐藏、inert 或自身 UI 中的伪候选不得当作宿主', () => {
  const f = fixture();
  const own = new Node('div', { id: 'team-context-fullscreen-page' });
  own.append(new Node('nav', { 'data-app-navigation-rail': true })); f.frame.append(own);
  assert.equal(f.host.describe().supported, true);
  f.rail.attrs.inert = ''; assert.equal(f.host.describe().reason, 'navigation-rail-hidden');
});

test('旧版支持新聊天中英文锚点，没有通用 nav 猜测或任意末尾按钮兜底', () => {
  const f = fixture({ kind: 'legacy' });
  assert.equal(f.host.describe().kind, 'legacy');
  f.legacyButton.attrs['aria-label'] = '删除全部';
  assert.equal(f.host.describe().reason, 'navigation-anchor-missing');
  delete f.sidebar.attrs.class;
  assert.equal(f.host.describe().supported, false);
});

test('旧版折叠仍识别布局种类，让已有 Team 页可回到原来的全宽算法', () => {
  const f = fixture({ kind: 'legacy', collapsed: true });
  assert.equal(f.host.describe().kind, 'legacy');
  assert.equal(f.host.describe().supported, false);
  assert.equal(f.host.locate().sidebar, f.sidebar);
});

test('离开判断覆盖 rail、第二列、标题栏，但不包含 Team 与主内容正文', () => {
  const f = fixture();
  for (const node of [f.home, f.legacyButton, f.titlebar]) assert.equal(f.host.isNavigationTarget(node), true);
  assert.equal(f.host.isNavigationTarget(f.main), false);
  const toggle = new Node('button', { 'data-app-shell-sidebar-trigger': 'true' }); f.titlebar.append(toggle);
  assert.equal(f.host.isNavigationTarget(toggle), false);
  const controls = new Node('button', { class: 'window-controls' }); f.titlebar.append(controls);
  assert.equal(f.host.isNavigationTarget(controls), false);
  const own = new Node('div', { id: 'team-context-sidebar-tab' }); f.group.append(own);
  assert.equal(f.host.isNavigationTarget(own), false);
});

test('bootstrap 无模块依赖，注入前探针与页面使用同一实现', () => {
  const f = fixture(); const context = vm.createContext({ document: f.document, window: f.window });
  vm.runInContext(hostAdapterBootstrap, context);
  assert.equal(context.window.TeamCodexHost.describe().kind, 'rail');
  const injector = fs.readFileSync(new URL('../inject/attach_codex.mjs', import.meta.url), 'utf8');
  assert.ok(injector.includes('${hostAdapterBootstrap}window.TeamCodexHost.describe()'));
  assert.ok(injector.includes("remote.includes('window.TeamCodexHost')"));
});

test('生产页面按新边界定位，不隐藏标题栏、不显示原本隐藏的页面', () => {
  const f = fixture();
  const source = fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');
  const positioning = source.slice(source.indexOf('  function getTitlebarHeight()'), source.indexOf('  function escapeHtml('));
  const page = { style: { display: 'none', setProperty(k, v) { this[k] = v; } }, dataset: {}, shadowRoot: null };
  let restored = 0;
  const context = vm.createContext({ window: f.window, document: f.document, navigator: { platform: 'Win32' },
    restoreNativeAppShellHeader: () => restored++, PAGE_ID: 'page', findSidebar: () => f.sidebar });
  vm.runInContext(positioning + '\nthis.position = positionPage;', context); context.position(page);
  assert.equal(page.style.left, '296px'); assert.equal(page.style.top, '44px');
  assert.equal(page.style.display, 'none'); assert.equal(page.dataset.platform, 'windows'); assert.equal(restored, 1);
});
