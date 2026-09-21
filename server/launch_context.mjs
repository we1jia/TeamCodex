import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const nativeHelper = () => process.env.TEAM_CODEX_CONTEXT_READER || path.resolve(root, '../../MacOS/TeamCodex');
const run = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

export function configurationStamp(env) {
  const value = name => Object.entries(env).find(([key]) => key.toUpperCase() === name)?.[1];
  const directory = value('CODEX_HOME') || path.join(value('HOME') || os.homedir(), '.codex');
  return digest(['config.toml', 'auth.json'].map(name => {
    try { return digest(fs.readFileSync(path.join(directory, name))); }
    catch (error) { if (error.code === 'ENOENT') return 'absent'; throw Error('无法确认账号配置'); }
  }).join(':'));
}

export function readLaunchContext(target) {
  let context;
  try {
    if (process.platform === 'darwin') {
      context = JSON.parse(run(nativeHelper(), ['--read-process-context', String(target.pid)]));
      const cwd = run('/usr/sbin/lsof', ['-a', '-p', String(target.pid), '-d', 'cwd', '-Fn']).split('\n').find(line => line.startsWith('n'));
      context.cwd = cwd?.slice(1);
    } else if (process.platform === 'win32') {
      context = JSON.parse(run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'windows/read-process-context.ps1'), '-TargetPid', String(target.pid)]));
      context.args = target.args;
    } else throw Error('unsupported');
  } catch { throw Error('无法完整读取 Codex 启动环境'); }
  if (path.resolve(context.path) !== path.resolve(target.path) || !Array.isArray(context.args) || !context.args.every(arg => typeof arg === 'string') || !context.env || !Object.keys(context.env).length || !context.cwd || !fs.existsSync(context.cwd)) throw Error('启动环境校验失败');
  return context;
}

export function prepareLaunchContext(snapshot) {
  const context = snapshot.target ? readLaunchContext(snapshot.target) : {
    path: snapshot.availablePath, args: [], env: { ...process.env }, cwd: path.dirname(snapshot.availablePath),
  };
  if (!snapshot.target) {
    for (const key of Object.keys(context.env)) if (/^TEAM_(?:CODEX|CONTEXT)_/.test(key) || key === 'NODE_OPTIONS') delete context.env[key];
  }
  const configStamp = configurationStamp(context.env);
  const environment = Object.entries(context.env).sort(([a], [b]) => a.localeCompare(b));
  return { ...context, configStamp, stamp: digest(JSON.stringify([context.path, context.args, context.cwd, environment, configStamp])) };
}
