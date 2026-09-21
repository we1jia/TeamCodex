import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { runtimeRevision } from '../server/runtime_identity.mjs';

const root = path.resolve(import.meta.dirname, '..');
const releaseFiles = ['launcher_host', 'codex_runtime', 'codex_runtime_policy', 'launch_context', 'runtime_identity', 'bootstrap_launcher'];
const freePort = async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};

test('隔离后台：启动、重复打开、更新重载、正常退出、再次启动', async t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'teamcodex-lifecycle-'));
  const port = await freePort();
  for (const relative of [...releaseFiles.map(name => `server/${name}.mjs`), 'inject/attach_codex.mjs', 'inject/cdp_websocket.mjs', 'ui/panel.html', 'version.json']) {
    const destination = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  const env = { ...process.env, TEAM_CODEX_LAUNCHER_PORT: String(port), TEAM_CODEX_NO_ATTACH: '1', TEAM_CONTEXT_DATA_DIR: path.join(fixture, 'data') };
  for (const name of ['NODE_OPTIONS', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[name];
  const request = async (endpoint, options) => {
    try { return await (await fetch(`http://127.0.0.1:${port}${endpoint}`, { ...options, headers: { connection: 'close' }, signal: AbortSignal.timeout(2000) })).json(); }
    catch (error) { if (error.cause?.code === 'ECONNREFUSED') return null; throw error; }
  };
  const stop = async () => {
    const status = await request('/api/runtime');
    if (!status) return;
    await request('/api/shutdown', { method: 'POST' });
    for (let i = 0; i < 100; i++) {
      try { if (!await request('/api/runtime')) return; }
      catch (error) { if (!['ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('isolated backend failed to exit');
  };
  t.after(async () => { await stop(); fs.rmSync(fixture, { recursive: true, force: true }); });
  const boot = async () => {
    const child = spawn(process.execPath, [path.join(fixture, 'server/bootstrap_launcher.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, stderr + (code ? JSON.stringify({ runtime: await request('/api/runtime'), expected: runtimeRevision(fixture) }) + fs.readFileSync(path.join(fixture, 'data/launcher.log'), 'utf8') : ''));
    return request('/api/runtime');
  };
  const first = await boot();
  assert.equal((await boot()).pid, first.pid);
  fs.appendFileSync(path.join(fixture, 'server/launcher_host.mjs'), '\n// isolated update fixture\n');
  const updated = await boot();
  assert.notEqual(updated.pid, first.pid);
  assert.notEqual(updated.revision, first.revision);
  await stop();
  assert.notEqual((await boot()).pid, updated.pid);
});

test('macOS 原生环境读取：保留空参数、空格和环境值，不依赖菜单语言', { skip: process.platform !== 'darwin' || !process.env.TEAM_CODEX_CONTEXT_READER }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', '', 'argument with spaces'], { env: { PATH: process.env.PATH, TEAM_FIXTURE: 'value with spaces=a' }, cwd: os.tmpdir(), stdio: 'ignore' });
  await once(child, 'spawn');
  try {
    const snapshot = JSON.parse(execFileSync(process.env.TEAM_CODEX_CONTEXT_READER, ['--read-process-context', String(child.pid)], { encoding: 'utf8' }));
    assert.deepEqual(snapshot.args.slice(-2), ['', 'argument with spaces']);
    assert.equal(snapshot.env.TEAM_FIXTURE, 'value with spaces=a');
  } finally { child.kill('SIGTERM'); await once(child, 'exit'); }
});
