import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../inject/workspace.js', import.meta.url), 'utf8');
const start = source.indexOf('    const activeWorkspaceElement =');
const dialogSource = source.slice(start < 0 ? source.indexOf('    const closeDialog =') : start, source.indexOf('    const submitForm ='));

const fixture = ({ onRender } = {}) => {
  const root = { activeElement: null };
  let confirmations = 0;
  let allowClose = true;
  let renders = 0;
  class Element {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase(); this.children = []; this.parentNode = null;
      this.attributes = new Map(); this.listeners = new Map(); this.dataset = {};
      this.hidden = false; this.disabled = false; this.open = false;
      this.tabIndex = /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(this.tagName) ? 0 : -1;
      this.style = {}; this.showCalls = 0;
    }
    get isConnected() { return this === element || Boolean(this.parentNode?.isConnected); }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'tabindex') this.tabIndex = Number(value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) {
      this.attributes.delete(name);
      if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    getRootNode() { return root; }
    getClientRects() { return this.hidden ? [] : [{ width: 80, height: 28 }]; }
    closest(selector) { return selector === '[hidden]' && this.hidden ? this : this.parentNode?.closest(selector) || null; }
    focus() { root.activeElement = this; }
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    emit(type, values = {}) {
      const event = { target: this, key: '', shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
      for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
      return event;
    }
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return descendants;
      if (selector === '[autofocus]') return descendants.filter(child => child.hasAttribute('autofocus'));
      return descendants.filter(child => /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(child.tagName) || child.hasAttribute('tabindex'));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    set innerHTML(markup) {
      this.children.forEach(child => child.parentNode = null); this.children = [];
      for (const match of markup.matchAll(/<(button|input|textarea|select)\b([^>]*)>/g)) {
        const child = new Element(match[1]);
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attr[1], attr[2]);
        this.appendChild(child);
      }
    }
    show() { this.open = true; this.showCalls++; }
    showModal() { throw new Error('禁止让整个Codex document进入modal/inert状态'); }
    close() { if (!this.open) return; this.open = false; this.emit('close'); }
  }
  const element = new Element('section');
  const body = element.appendChild(new Element('div'));
  const opener = body.appendChild(new Element('button')); opener.setAttribute('data-action', 'new-task'); opener.focus();
  const document = { createElement: tag => new Element(tag), get activeElement() { return root.activeElement; }, addEventListener() { throw new Error('禁止绑定document级焦点陷阱'); } };
  const window = { confirm() { confirmations++; return allowClose; }, getComputedStyle: node => ({ display: node.hidden ? 'none' : 'block', visibility: 'visible' }) };
  const context = vm.createContext({ document, window, element, body, escape: value => value, button: action => `<button data-action="${action}">关闭</button>`, render: () => { renders++; onRender?.({ body, Element }); } });
  vm.runInContext(`let dialog = null, dialogLayer = null, dialogCleanup = null, dialogOpener = null, selection = { id: 'resource' }, busy = false, destroyed = false;\n${dialogSource}\nthis.controller = { showDialog, closeDialog, hideWorkspace, closeEditor: () => requestDialogClose({ restoreFocus: false, rerender: false }), get dialog() { return dialog; }, get layer() { return dialogLayer; }, get selection() { return selection; }, busy(value) { busy = value; }, destroy() { destroyed = true; closeDialog({ restoreFocus: false, rerender: false }); } };`, context);
  return { ...context.controller, controller: context.controller, element, body, opener, root, document, Element, allowClose: value => { allowClose = value; }, confirmations: () => confirmations, renders: () => renders };
};

const openEditor = fixture => {
  fixture.controller.showDialog('编辑任务', '<form><input name="title"><textarea name="description"></textarea><button data-action="save">保存</button></form>');
  return fixture.controller.dialog;
};

test('弹窗使用show()和Team局部backdrop，不调用showModal或修改宿主inert', () => {
  const f = fixture(); const dialog = openEditor(f);
  assert.equal(dialog.showCalls, 1);
  assert.equal(dialog.getAttribute('aria-modal'), 'false');
  assert.equal(dialog.parentNode, f.controller.layer);
  assert.equal(f.controller.layer.parentNode, f.element);
  assert.equal(f.element.dataset.dialogOpen, 'true');
  assert.equal(f.body.hasAttribute('inert'), false);
  assert.equal(f.element.hasAttribute('inert'), false);
});

test('Escape取消未保存确认时保留输入、弹层和焦点；确认后只关闭一次', () => {
  const f = fixture(); const dialog = openEditor(f);
  dialog.dataset.dirty = 'true'; dialog.children[1].value = '未保存草稿';
  f.allowClose(false);
  const cancelled = f.element.emit('keydown', { key: 'Escape', target: dialog.children[1] });
  assert.equal(cancelled.defaultPrevented, true);
  assert.equal(f.controller.dialog, dialog);
  assert.equal(dialog.children[1].value, '未保存草稿');
  assert.equal(f.confirmations(), 1);
  f.allowClose(true);
  f.element.emit('keydown', { key: 'Escape', target: dialog.children[1] });
  assert.equal(f.controller.dialog, null);
  assert.equal(f.controller.layer, null);
  assert.equal(f.confirmations(), 2);
  assert.equal(f.renders(), 1);
  assert.equal(f.root.activeElement, f.opener);
});

test('局部Tab循环和Shift+Tab循环，原生控件焦点不被全局抢回', () => {
  const f = fixture(); const dialog = openEditor(f);
  const first = dialog.children[0]; const last = dialog.children.at(-1);
  last.focus(); const forward = f.element.emit('keydown', { key: 'Tab', target: last });
  assert.equal(forward.defaultPrevented, true); assert.equal(f.root.activeElement, first);
  const backward = f.element.emit('keydown', { key: 'Tab', shiftKey: true, target: first });
  assert.equal(backward.defaultPrevented, true); assert.equal(f.root.activeElement, last);
  const nativeControl = new f.Element('button'); nativeControl.focus();
  assert.equal(f.root.activeElement, nativeControl);
});

test('只拦截Team内部背景焦点，dialog本身收到Shift+Tab时仍回到最后控件', () => {
  const f = fixture(); const dialog = openEditor(f);
  f.opener.focus(); f.element.emit('focusin', { target: f.opener });
  assert.equal(f.root.activeElement, dialog.children[0]);
  dialog.focus(); f.element.emit('keydown', { key: 'Tab', shiftKey: true, target: dialog });
  assert.equal(f.root.activeElement, dialog.children.at(-1));
});

test('busy或输入法处理Escape时不能丢弃正在编辑的弹窗', () => {
  const f = fixture(); const dialog = openEditor(f);
  f.controller.busy(true);
  f.element.emit('keydown', { key: 'Escape', target: dialog });
  assert.equal(f.controller.dialog, dialog);
  f.controller.busy(false);
  f.element.emit('keydown', { key: 'Escape', target: dialog, isComposing: true });
  assert.equal(f.controller.dialog, dialog);
});

test('backdrop点击和cancel事件沿用未保存保护，正常关闭清理全部局部监听', () => {
  const f = fixture(); const dialog = openEditor(f); const layer = f.controller.layer;
  dialog.dataset.dirty = 'true'; f.allowClose(false);
  layer.emit('click');
  assert.equal(f.controller.dialog, dialog);
  const cancelled = dialog.emit('cancel');
  assert.equal(cancelled.defaultPrevented, true); assert.equal(f.controller.dialog, dialog);
  f.allowClose(true); layer.emit('click');
  assert.equal(f.controller.dialog, null);
  assert.equal(f.element.listeners.get('keydown').size, 0);
  assert.equal(f.element.listeners.get('focusin').size, 0);
  assert.equal(layer.listeners.get('click').size, 0);
  assert.equal(f.element.hasAttribute('data-dialog-open'), false);
});

test('重新打开详情清理旧层且保留引用对象，旧close事件不能关闭新弹窗', () => {
  const f = fixture(); const first = openEditor(f); const oldLayer = f.controller.layer;
  f.controller.showDialog('资料详情', '<button data-action="download">下载</button>');
  const second = f.controller.dialog;
  assert.equal(oldLayer.parentNode, null);
  assert.equal(f.controller.selection.id, 'resource');
  first.emit('close');
  assert.equal(f.controller.dialog, second);
  assert.equal(f.element.listeners.get('keydown').size, 1);
});

test('原生close事件也移除局部backdrop与监听，不留下不可点击遮罩', () => {
  const f = fixture(); const dialog = openEditor(f); const layer = f.controller.layer;
  dialog.close();
  assert.equal(f.controller.dialog, null);
  assert.equal(f.controller.layer, null);
  assert.equal(layer.parentNode, null);
  assert.equal(f.element.listeners.get('keydown').size, 0);
});

test('hide未保存取消时返回false且不隐藏；确认后清理且不抢原生焦点', () => {
  const f = fixture(); const dialog = openEditor(f);
  dialog.dataset.dirty = 'true'; f.allowClose(false);
  assert.equal(f.controller.hideWorkspace(), false);
  assert.equal(f.element.hidden, false);
  f.allowClose(true);
  assert.equal(f.controller.hideWorkspace(), true);
  assert.equal(f.element.hidden, true);
  assert.equal(f.controller.dialog, null);
  assert.equal(f.controller.layer, null);
});

test('保存完成的程序化关闭允许busy状态；destroy与scope重置使用无焦点恢复清理', () => {
  const f = fixture(); openEditor(f); f.controller.busy(true);
  f.controller.closeDialog();
  assert.equal(f.controller.dialog, null);
  f.controller.busy(false); openEditor(f);
  f.controller.destroy();
  assert.equal(f.controller.dialog, null);
  assert.equal(f.controller.layer, null);
  assert.equal(f.element.listeners.get('keydown').size, 0);
});

test('原生侧栏离开接口拒绝busy与未保存取消；通过后只关闭编辑器而不隐藏整个工作区', () => {
  const f = fixture(); const dialog = openEditor(f);
  f.controller.busy(true);
  assert.equal(f.controller.closeEditor(), false);
  assert.equal(f.controller.dialog, dialog);
  f.controller.busy(false); dialog.dataset.dirty = 'true'; f.allowClose(false);
  assert.equal(f.controller.closeEditor(), false);
  assert.equal(f.controller.dialog, dialog);
  f.allowClose(true);
  assert.equal(f.controller.closeEditor(), true);
  assert.equal(f.controller.dialog, null);
  assert.equal(f.element.hidden, false);
  assert.equal(f.renders(), 0);
});

test('重绘销毁原按钮后，按原data-action恢复焦点到新按钮', () => {
  let replacement;
  const f = fixture({ onRender: ({ body, Element }) => {
    body.children.forEach(child => child.remove());
    replacement = body.appendChild(new Element('button')); replacement.setAttribute('data-action', 'new-task');
  } });
  openEditor(f); f.controller.closeDialog();
  assert.equal(f.root.activeElement, replacement);
});

test('源代码清理入口统一使用closeDialog，长表单局限在工作区弹层滚动', () => {
  assert.match(source, /const destroy = \(\) => \{[^\n]*closeDialog\(\{ restoreFocus: false, rerender: false \}\)/);
  assert.match(source, /hide: hideWorkspace/);
  assert.match(source, /closeEditor: \(\) => requestDialogClose\(\{ restoreFocus: false, rerender: false \}\)/);
  assert.match(source, /scope = next;[\s\S]*?closeDialog\(\{ restoreFocus: false, rerender: false \}\)/);
  const css = fs.readFileSync(new URL('../inject/workspace.css', import.meta.url), 'utf8');
  assert.match(css, /\.tw-dialog-layer[^}]*position:\s*absolute[^}]*inset:\s*0/s);
  assert.match(css, /\.tw-dialog-layer > dialog[^}]*max-height:\s*100%[^}]*overflow:\s*auto/s);
});
