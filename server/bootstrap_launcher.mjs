import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installationId, runtimeRevision } from './runtime_identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.TEAM_CODEX_LAUNCHER_PORT || 18767);
const base = `http://127.0.0.1:${port}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const data = process.env.TEAM_CONTEXT_DATA_DIR || path.join(root, 'data');
const request = async (endpoint, options) => {
  try {
    const response = await fetch(base + endpoint, { ...options, headers: { ...options?.headers, connection: 'close' }, signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw Error('控制端口已被使用，无法确认服务身份');
    return response.json();
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return null;
    throw error;
  }
};
const probe = async () => {
  try { return await request('/api/runtime'); }
  catch (error) {
    if (['ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) return { transitioning: true };
    throw error;
  }
};

async function main() {
  fs.mkdirSync(data, { recursive: true });
  const lock = path.join(data, 'launcher-bootstrap.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isInteger(owner) || owner <= 1) throw Error('启动锁异常，请查看诊断信息');
    try { process.kill(owner, 0); return; }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    fs.unlinkSync(lock);
    fd = fs.openSync(lock, 'wx', 0o600);
  }
  fs.writeFileSync(fd, String(process.pid));
  fs.closeSync(fd);
  try {
    const existing = await request('/api/runtime');
    if (existing) {
      if (existing.service !== 'teamcodex-launcher' || existing.installation !== installationId(root)) throw Error('另一安装的控制后台正在运行，请先退出该安装');
      if (existing.revision === runtimeRevision(root) && !existing.shutting_down) return;
      if (!existing.shutting_down) await request('/api/shutdown', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      let closed = false;
      for (let i = 0; i < 80; i++) {
        await delay(250);
        if (!await probe()) { closed = true; break; }
      }
      if (!closed) throw Error('旧控制后台尚未退出，未重复启动');
    }
    const output = fs.openSync(path.join(data, 'launcher.log'), 'a');
    const child = spawn(process.execPath, [path.join(root, 'server/launcher_host.mjs')], { cwd: root, env: process.env, detached: true, stdio: ['ignore', output, output] });
    fs.closeSync(output);
    child.unref();
    for (let i = 0; i < 40; i++) {
      await delay(250);
      const ready = await probe();
      if (ready?.installation === installationId(root) && ready.revision === runtimeRevision(root)) return;
    }
    throw Error('控制后台启动超时，请查看诊断信息');
  } finally { fs.unlinkSync(lock); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
