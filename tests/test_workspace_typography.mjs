import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');
const typography = source.slice(source.indexOf('  function readWorkspaceTypography()'), source.indexOf('  function applyCodexTheme('));
const read = (controls, body = { fontFamily: 'system-ui', fontSize: '16px' }) => {
  const context = vm.createContext({
    document: { body }, window: { getComputedStyle: element => element },
    findNav: () => ({ querySelectorAll: () => controls }), textOf: node => node.label,
  });
  return vm.runInContext(typography + '\nreadWorkspaceTypography()', context);
};

test('控件跟随原生菜单13px，不继承body16px或Codex标题17px', () => {
  const result = read([{ label: 'Codex', fontSize: '17px' }, { label: '插件', fontFamily: 'system-ui', fontSize: '13px' }]);
  assert.equal(result.fontSize, '13px');
});
test('保留用户的原生菜单字号，不按设备像素比二次缩放', () => {
  assert.equal(read([{ label: 'Plugins', fontSize: '15px', fontFamily: 'Segoe UI' }]).fontSize, '15px');
  assert.equal(read([{ label: '新对话', fontSize: '13px', fontFamily: 'system-ui' }]).fontFamily, 'system-ui');
});
test('原生导航暂缺时使用紧凑基准，保留宿主字体', () => {
  const result = read([]);
  assert.equal(result.fontSize, '13px');
  assert.equal(result.fontFamily, 'system-ui');
});
test('工作区响应式依赖容器，按钮/图标尺寸有独立配置', () => {
  const css = fs.readFileSync(new URL('../inject/workspace.css', import.meta.url), 'utf8');
  assert.match(css, /container: team-workspace \/ inline-size/);
  assert.match(css, /@container team-workspace \(max-width: 860px\)/);
  assert.match(css, /--ws-control-height: 28px/);
  assert.match(css, /--ws-icon-size: 14px/);
  assert.match(css, /--team-host-leading-safe/);
  assert.match(css, /table-layout: fixed/);
});
test('颜色优先继承Codex语义变量，状态色与字号不绑定固定主题', () => {
  const css = fs.readFileSync(new URL('../inject/workspace.css', import.meta.url), 'utf8');
  for (const token of ['--color-token-main-surface-primary', '--color-text-primary', '--color-border-primary-outline', '--app-color-text-accent', '--color-text-success', '--team-native-control-font-size']) assert.ok(css.includes(token), token);
  assert.match(css, /background: var\(--ws-success\)/);
});
