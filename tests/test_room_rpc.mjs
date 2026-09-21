import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.env.TEAM_CODEX_TEST_INJECTOR || new URL('../inject/attach_codex.mjs', import.meta.url);
const source = fs.readFileSync(file, 'utf8');
const extract = name => {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `missing ${name}`);
  return match[0];
};

test('空房间密码必须保留为空，不借用默认房间密码', () => {
  const context = vm.createContext({ DEFAULT_ROOM: '1024', DEFAULT_ROOM_KEY: 'default-key' });
  vm.runInContext(extract('resolveRoomContext') + ';this.resolveRoomContext=resolveRoomContext;', context);
  assert.equal(context.resolveRoomContext({ roomId: 'Media', roomKey: '' }).key, '');
  assert.equal(context.resolveRoomContext({ roomId: '1024', roomKey: '' }).key, '');
  assert.equal(context.resolveRoomContext({ roomId: 'Media' }).key, '');
  assert.equal(context.resolveRoomContext({ roomId: 'Media', roomKeys: { Media: 'room-secret' } }).key, 'room-secret');
  assert.equal(context.resolveRoomContext({ roomId: 'Media', roomKey: 'explicit' }).key, 'explicit');
  assert.equal(context.resolveRoomContext().key, 'default-key');
});

test('无密码 Media 进入消息转发和回执流程，不在取出请求后抛异常', async () => {
  const forwarded = [], replies = [];
  const request = { id: 'fixture-rpc', hubUrl: 'http://fixture.invalid', path: '/api/messages', method: 'POST', body: { text: 'fixture' } };
  const state = { config: { roomId: 'Media', roomKey: '', hubUrl: request.hubUrl }, pendingCalls: [request] };
  const session = { ws: { readyState: 1 }, close() {}, send: async (_method, params = {}) => {
    const expression = params.expression || '';
    if (expression.includes('pending: window.__teamContextTakePending')) return { result: { value: state } };
    if (expression.includes('__teamContextOnNativeResponse')) { replies.push(expression); return {}; }
    if (expression.includes('installed: Boolean')) return { result: { value: { installed: true, version: 'inline-v100' } } };
    if (expression.includes('installed:!!')) return { result: { value: { installed: true, ui: 'inline-v100' } } };
    return { result: { value: true } };
  } };
  const context = vm.createContext({
    stopping: false, process: { env: {} }, DEFAULT_ROOM: '1024', DEFAULT_ROOM_KEY: 'default-key', HOST_URL: request.hubUrl,
    consumedUpdates: new Set(), hotUpdateDecision: () => 'keep', console: { log() {}, warn() {}, error() {} },
    applyComposerAppearance: async () => {},
    executeNativeRpc: async payload => { forwarded.push(payload); return { id: payload.id, ok: true, status: 200, data: {} }; },
    getJson: async () => ({ messages: [], members: [], seq: 0 }),
  });
  if (source.includes('function resolveRoomContext(')) vm.runInContext(extract('resolveRoomContext'), context);
  vm.runInContext(extract('injectTarget') + ';this.injectTarget=injectTarget;', context);
  const result = await context.injectTarget({ id: 'page' }, 'const UI_VERSION="inline-v100";', new Map([['page', session]]));
  await Promise.resolve();
  assert.equal(forwarded.length, 1, result?.syncError || 'request was dropped');
  assert.equal(replies.length, 1);
});

test('即时绑定与轮询取到相同 RPC，只转发一次', async () => {
  let sends = 0;
  const context = vm.createContext({ HOST_URL: 'http://fixture.invalid', nativeRpcRequests: new Map(), performNativeRpc: async () => { sends++; return { ok: true }; } });
  vm.runInContext(extract('executeNativeRpc') + ';this.executeNativeRpc=executeNativeRpc;', context);
  const payload = { id: 'same', hubUrl: 'http://fixture.invalid' };
  await Promise.all([context.executeNativeRpc(payload), context.executeNativeRpc(payload)]);
  assert.equal(sends, 1);
});
