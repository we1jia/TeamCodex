import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../inject/composer_appearance.js', import.meta.url), 'utf8');
function fixture(nativeSize) {
  const properties = new Map(), sheets = new Map();
  const input = { value: '未发送的草稿', selectionStart: 2, placeholder: 'old', setAttribute() {} };
  const root = { getElementById: id => id === 'input' ? input : sheets.get(id), appendChild: node => sheets.set(node.id, node) };
  const page = { shadowRoot: root, style: { getPropertyValue: key => properties.get(key) || '', setProperty: (key, value) => properties.set(key, value) } };
  const native = nativeSize ? { fontSize: nativeSize, fontFamily: 'Native Font', closest: () => null } : null;
  let observes = 0;
  const context = vm.createContext({
    window: {}, document: { body: { fontSize: '20px', fontFamily: 'Native Font' }, documentElement: {}, getElementById: () => page, querySelector: () => native, createElement: () => ({ dataset: {} }) },
    getComputedStyle: node => node, requestAnimationFrame: fn => fn(), MutationObserver: class { observe() { observes++; } disconnect() {} },
  });
  return { context, input, properties, sheets, observes: () => observes };
}

test('缺少原生输入区时使用14px，不继承20px正文；不改变草稿和光标', () => {
  const f = fixture();
  vm.runInContext(source, f.context);
  assert.equal(f.properties.get('--team-composer-font-size'), '14px');
  assert.equal(f.input.value, '未发送的草稿');
  assert.equal(f.input.selectionStart, 2);
  assert.equal(f.input.placeholder, '输入消息，@ 关联任务');
});

test('有原生输入区时跟随实测字号；反复挂载不重复添加样式和观察器', () => {
  const f = fixture('16px');
  vm.runInContext(source, f.context);
  vm.runInContext(source, f.context);
  assert.equal(f.properties.get('--team-composer-font-size'), '16px');
  assert.equal(f.sheets.size, 1);
  assert.equal(f.observes(), 1);
});

test('Mac 苹果图案与源码一致，兼容层不替换头像或覆盖在线标记', () => {
  const f = fixture();
  vm.runInContext(source, f.context);
  const css = f.sheets.get('team-composer-appearance').textContent;
  assert.match(css, /\.stack-avatar\.is-mac::before/);
  assert.doesNotMatch(css, /\.is-win|stack-online-dot|is-active/);
  const main = fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');
  const path = main.match(/data-device-icon="mac"[^]*?<path d="([^"]+)"/)[1];
  assert.ok(decodeURIComponent(css.match(/data:image\/svg\+xml,([^"\)]+)/)[1]).includes(path));
  assert.match(main, /data-device-icon="mac" aria-hidden="true"/);
});
