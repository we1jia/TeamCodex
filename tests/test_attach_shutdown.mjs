import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { CdpWebSocket } from '../inject/cdp_websocket.mjs';

const source = fs.readFileSync(new URL('../inject/attach_codex.mjs', import.meta.url), 'utf8');
const extract = name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))[0];

test('真实 socket：对端不结束连接也能释放 CDP，挂起命令被拒绝', async t => {
  const peers = new Set();
  const server = net.createServer({ allowHalfOpen: true }, peer => {
    peers.add(peer);
    peer.once('data', () => peer.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'));
  });
  t.after(() => { for (const peer of peers) peer.destroy(); server.close(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const context = vm.createContext({ CdpWebSocket, setTimeout, clearTimeout, stopping: false });
  vm.runInContext(extract('connect') + ';this.connect = connect;', context);
  const session = context.connect(`ws://127.0.0.1:${server.address().port}/fixture`);
  t.after(() => session.close());
  await session.ready;
  const request = session.send('Runtime.enable');
  session.close();
  await assert.rejects(request, /session closed/);
  assert.equal(session.ws.socket.destroyed, true);
});

test('CDP terminate 销毁自己的 socket，重复关闭幂等', () => {
  let destroyed = 0;
  const socket = Object.create(CdpWebSocket.prototype);
  Object.assign(socket, { readyState: 1, socket: { destroy() { destroyed++; } }, listeners: new Map() });
  socket.terminate(); socket.terminate();
  assert.equal(destroyed, 1);
  assert.equal(socket.readyState, 3);
});

test('CDP session 关闭后不再分发 binding，即使底层没有 close 回调', async () => {
  let connection, terminated = 0, delivered = 0;
  class FakeSocket extends EventEmitter {
    constructor() { super(); this.readyState = 1; connection = this; queueMicrotask(() => this.emit('open')); }
    addEventListener(name, fn) { this.on(name, fn); }
    close() {}
    terminate() { terminated++; }
  }
  const context = vm.createContext({ CdpWebSocket: FakeSocket, setTimeout, clearTimeout, stopping: false });
  vm.runInContext(extract('connect') + ';this.connect = connect;', context);
  const session = context.connect('ws://fixture');
  await session.ready;
  session.onEvent(() => delivered++);
  session.close(); session.close();
  connection.emit('message', { data: JSON.stringify({ method: 'Runtime.bindingCalled' }) });
  assert.equal(delivered, 0);
  assert.equal(terminated, 1);
});

test('停止发生在异步读取脚本期间：不得在清理后新建 session', async () => {
  const signals = new EventEmitter();
  let injected = 0;
  const receipts = [];
  const runtime = { state: 'ready', target: { pid: 123 }, port: 12345 };
  const context = vm.createContext({
    process: signals, stopping: false, setTimeout, clearTimeout,
    inspectRuntime: async () => runtime, fingerprint: () => 'same',
    assertSafeCodexUiTarget: () => ({ ok: true }), listListenPorts: () => [],
    resolveInjectScript: async () => { signals.emit('SIGTERM'); return 'source'; }, injectSource: text => text,
    getJson: async () => [{ id: 'page' }], isCodexPage: () => true,
    injectTarget: async () => { injected++; return { installed: true }; },
    writeAttachState: state => receipts.push(state), nativeRpcRequests: new Map(),
    http: { globalAgent: { destroy() {} } }, https: { globalAgent: { destroy() {} } },
  });
  vm.runInContext(extract('main') + ';this.main = main;', context);
  await context.main();
  assert.equal(injected, 0);
  assert.equal(receipts.at(-1).state, 'stopped');
  assert.equal(receipts.some(receipt => receipt.installed), false);
});

test('连接在 ready 之前登记，停止时能够找到并关闭正在连接的 session', async () => {
  const sessions = new Map();
  let completeReady;
  const session = { ws: { readyState: 0 }, ready: new Promise(resolve => completeReady = resolve), close() {}, send: async () => {}, onEvent() {} };
  const context = vm.createContext({ connect: () => session, stopping: false, console });
  vm.runInContext(extract('injectTarget') + ';this.injectTarget = injectTarget;', context);
  const pending = context.injectTarget({ id: 'page' }, '', sessions);
  assert.equal(sessions.get('page'), session);
  context.stopping = true;
  completeReady();
  await pending;
  assert.equal(sessions.size, 0);
});

test('并发重新挂载按序执行，失败不会堵死后续操作', async () => {
  const launcher = fs.readFileSync(new URL('../server/launcher_host.mjs', import.meta.url), 'utf8');
  const queue = launcher.match(/function queueAttachOperation\([^]*?\n\}/);
  assert.ok(queue, '挂载操作必须共享一个串行队列');
  const context = vm.createContext({});
  vm.runInContext('let attachOperation = Promise.resolve();' + queue[0] + ';this.queue = queueAttachOperation;', context);
  let active = 0, peak = 0;
  const operation = async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; };
  await Promise.all([context.queue(operation), context.queue(operation), context.queue(operation)]);
  assert.equal(peak, 1);
  await assert.rejects(context.queue(() => { throw Error('fixture'); }), /fixture/);
  await context.queue(operation);
  assert.match(launcher, /function startAttach\([^]*?queueAttachOperation/);
  assert.match(launcher, /queueAttachOperation\(stopAttach\)/);
});
