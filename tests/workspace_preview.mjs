// 仅启动隔离验收 Hub，不挂载或启动 Codex；Ctrl-C 只结束本脚本的子进程。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'team-workspace-preview-'));
const port = Number(process.env.TEAM_WORKSPACE_PREVIEW_PORT || 19931);
const child = spawn(process.execPath, [path.join(root, 'server/dev_host.mjs')], {
  env: { ...process.env, TEAM_CONTEXT_BIND_HOST: '127.0.0.1', TEAM_CONTEXT_PORT: String(port), TEAM_CONTEXT_DATA_DIR: directory, TEAM_CONTEXT_DATA_FILE: path.join(directory, 'messages.json') }, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.pipe(process.stderr);
process.on('SIGINT', () => child.kill('SIGTERM'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', code => process.exit(code || 0));
const ready = new Promise((resolve, reject) => {
  child.stdout.on('data', () => resolve());
  child.once('exit', code => reject(new Error(`隔离服务启动失败 ${code}`)));
});
await ready;
console.log(JSON.stringify({ url: `http://127.0.0.1:${port}/workspace`, dataDirectory: directory, pid: child.pid, room: '1024', previewKey: '123456', isolated: true }));
