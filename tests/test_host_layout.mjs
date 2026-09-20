import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');
const positioning = source.slice(source.indexOf('  function getTitlebarHeight()'), source.indexOf('  function escapeHtml('));
const headers = source.slice(source.indexOf('  function hideNativeAppShellHeader()'), source.indexOf('  function closePage()'));

const style = (values = {}) => ({
  display: '', visibility: 'visible', ...values,
  setProperty(name, value) { this[name] = value; },
});

const node = (selectors, bounds, values = {}) => ({
  selectors, dataset: {}, style: style(values),
  getBoundingClientRect() {
    if (this.style.display === 'none') return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    return { ...bounds, right: bounds.left + bounds.width, bottom: bounds.top + bounds.height };
  },
});

const fixture = ({ platform = 'Win32', dpr = 1, sidebar = null, elements = [], width = 1280, height = 800, os } = {}) => {
  const page = { dataset: {}, style: style(), shadowRoot: null, setAttribute(name, value) { this[name] = value; } };
  const queries = [];
  const document = {
    documentElement: { clientWidth: width, clientHeight: height },
    getElementById: id => id === 'team-context-fullscreen-page' ? page : null,
    querySelector() { throw new Error('不得用通用 main/header 猜测系统标题栏'); },
    querySelectorAll(selector) {
      queries.push(selector);
      const choices = selector.split(',').map(value => value.trim());
      return elements.filter(element => element.selectors.some(value => choices.includes(value)));
    },
  };
  const window = {
    innerWidth: width, innerHeight: height, devicePixelRatio: dpr,
    __TEAM_CONTEXT_OS__: os,
    getComputedStyle: element => element.style,
  };
  const context = vm.createContext({ window, document, navigator: { userAgent: platform, platform }, findSidebar: () => sidebar, PAGE_ID: 'team-context-fullscreen-page' });
  vm.runInContext(`${positioning}\n${headers}\nthis.layout = { getTitlebarHeight, positionPage, hideNativeAppShellHeader, restoreNativeAppShellHeader };`, context);
  return { ...context.layout, page, window, document, queries };
};

test('Windows 使用真实 titlebar 的 bottom，不把60px当作高度上限', () => {
  const titlebar = node(['[data-testid="titlebar"]'], { left: 0, top: 0, width: 1280, height: 72 });
  const f = fixture({ elements: [titlebar] });
  assert.equal(f.getTitlebarHeight(), 72);
  f.positionPage(f.page);
  assert.equal(f.page.style.top, '72px');
  assert.equal(f.page.style['--team-host-top'], '72px');
});

test('窗口控制按钮的实际底边也参与避让，不能被通用聊天header干扰', () => {
  const controls = node(['[data-testid="window-controls"]'], { left: 1120, top: 8, width: 150, height: 36 });
  const unrelatedHeader = node(['header'], { left: 240, top: 0, width: 1040, height: 80 });
  const f = fixture({ elements: [controls, unrelatedHeader] });
  assert.equal(f.getTitlebarHeight(), 44);
});

test('只存在隐藏或远离窗口顶部的titlebar时保留38px安全兜底', () => {
  const hidden = node(['.titlebar'], { left: 0, top: 0, width: 1280, height: 80 }, { display: 'none' });
  const offscreen = node(['[data-testid="window-controls"]'], { left: 800, top: 400, width: 140, height: 40 });
  const f = fixture({ elements: [hidden, offscreen] });
  assert.equal(f.getTitlebarHeight(), 38);
});

for (const dpr of [1, 1.25, 1.5]) {
  test(`${dpr * 100}%显示缩放：使用CSS坐标，不再次乘设备像素比`, () => {
    const sidebar = node([], { left: 0, top: 40, width: 240, height: 660 });
    const titlebar = node(['.titlebar'], { left: 0, top: 0, width: 1280 / dpr, height: 40 });
    const f = fixture({ sidebar, elements: [titlebar], dpr, width: 1280 / dpr, height: 800 / dpr });
    f.positionPage(f.page);
    assert.equal(f.page.style.top, '40px');
    assert.equal(f.page.style.left, '240px');
    assert.equal(f.page.style['--team-host-left'], '240px');
    assert.equal(f.page.dataset.sidebarCollapsed, 'false');
  });
}

test('Windows 不隐藏原生draggable标题栏，并恢复旧版本留下的display:none', () => {
  const nativeHeader = node(['header.draggable', '[data-testid="titlebar"]'], { left: 0, top: 0, width: 1280, height: 48 }, { display: 'none' });
  nativeHeader.dataset.teamContextPrevDisplay = 'flex';
  const f = fixture({ elements: [nativeHeader] });
  f.positionPage(f.page);
  assert.equal(nativeHeader.style.display, 'flex');
  assert.equal(f.page.style.top, '48px');
  f.hideNativeAppShellHeader();
  assert.equal(nativeHeader.style.display, 'flex');
  assert.equal('teamContextPrevDisplay' in nativeHeader.dataset, false);
});

test('macOS展开侧栏保持0top与原来的聊天header隐藏/恢复行为', () => {
  const sidebar = node([], { left: 0, top: 0, width: 240, height: 800 });
  const nativeHeader = node(['header.draggable'], { left: 240, top: 0, width: 1040, height: 48 }, { display: 'flex' });
  const f = fixture({ platform: 'MacIntel', sidebar, elements: [nativeHeader] });
  f.positionPage(f.page);
  assert.equal(f.page.style.top, '0px');
  assert.equal(f.page.style.left, '240px');
  assert.equal(f.page.style['--team-host-leading-safe'], '0px');
  f.hideNativeAppShellHeader();
  assert.equal(nativeHeader.style.display, 'none');
  f.restoreNativeAppShellHeader();
  assert.equal(nativeHeader.style.display, 'flex');
});

test('隐藏/移出屏幕/只剩40px的侧栏不占用内容区；macOS折叠保留交通灯横向安全区', () => {
  for (const sidebar of [
    node([], { left: 0, top: 0, width: 240, height: 800 }, { display: 'none' }),
    node([], { left: -240, top: 0, width: 240, height: 800 }),
    node([], { left: -200, top: 0, width: 240, height: 800 }),
  ]) {
    const f = fixture({ platform: 'MacIntel', sidebar });
    f.positionPage(f.page);
    assert.equal(f.page.style.left, '0px');
    assert.equal(f.page.dataset.sidebarCollapsed, 'true');
    assert.equal(f.page.style['--team-host-leading-safe'], '84px');
  }
});

test('注入器给出的win32平台信息同样用于避让和data-platform，不依赖UA', () => {
  const f = fixture({ platform: 'Linux', os: 'win32' });
  f.positionPage(f.page);
  assert.equal(f.page.style.top, '38px');
  assert.equal(f.page.dataset.platform, 'windows');
  assert.equal(f.page.style['--team-host-leading-safe'], '0px');
});

test('布局更新入口只定位已有页面，不创建、销毁或显示隐藏页面', () => {
  const f = fixture();
  assert.equal(typeof f.window.__teamContextPositionPage, 'function');
  f.page.style.display = 'none';
  f.page.style.visibility = 'hidden';
  f.window.__teamContextPositionPage();
  assert.equal(f.page.style.display, 'none');
  assert.equal(f.page.style.visibility, 'hidden');
  f.document.getElementById = () => null;
  assert.doesNotThrow(() => f.window.__teamContextPositionPage());
});
