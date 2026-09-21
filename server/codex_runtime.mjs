import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isCodexDesktop, debugPort, launchArguments, chooseRuntime, fingerprint } from './codex_runtime_policy.mjs';
import { prepareLaunchContext, configurationStamp, nativeHelper } from './launch_context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
const powershell = script => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// Windows 的反斜杠/引号遵循 CommandLineToArgvW 规则，不能简单按空格切分路径。
export function splitArguments(command, windows = process.platform === 'win32') {
  const args = [];
  let value = '', quoted = false, started = false;
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (windows && char === '\\') {
      let count = 1;
      while (command[index + 1] === '\\') { count++; index++; }
      if (command[index + 1] === '"') {
        value += '\\'.repeat(Math.floor(count / 2)); index++;
        if (count % 2) value += '"'; else quoted = !quoted;
      } else value += '\\'.repeat(count);
      started = true;
    } else if (char === '"') { quoted = !quoted; started = true; }
    else if (/\s/.test(char) && !quoted) { if (started) args.push(value); value = ''; started = false; }
    else { value += char; started = true; }
  }
  if (quoted) throw new Error('无法安全解析原实例启动参数');
  if (started) args.push(value);
  return args;
}

export function processInventory() {
  if (process.platform === 'win32') {
    const raw = powershell("@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('Codex.exe','ChatGPT.exe','node.exe') } | ForEach-Object { @{pid=$_.ProcessId; name=$_.Name; path=$_.ExecutablePath; command=$_.CommandLine; startedAt=([string]$_.CreationDate)} }) | ConvertTo-Json -Compress");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    const items = Array.isArray(parsed) ? parsed : [parsed];
    if (items.some(item => /^(?:Codex|ChatGPT)\.exe$/i.test(item.name) && (!item.path || !item.command))) throw new Error('部分客户端路径不可读，无法安全确认目标；请检查权限');
    return items.filter(item => item.path && item.command).map(item => ({ ...item, args: splitArguments(item.command, true).slice(1) }));
  }
  return run('/bin/ps', ['-ww', '-axo', 'pid=,comm=']).split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match || !/(?:\/MacOS\/(?:ChatGPT|Codex)|\/node)$/.test(match[2])) return [];
    try {
      const details = run('/bin/ps', ['-ww', '-p', match[1], '-o', 'lstart=', '-o', 'args=']).trim();
      const info = details.match(/^(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d{4})\s+(.+)$/);
      if (!info || !info[2].startsWith(match[2])) return [];
      return [{ pid: Number(match[1]), path: match[2], startedAt: info[1], command: info[2], args: splitArguments(info[2].slice(match[2].length).trim(), false) }];
    } catch { return []; } // 枚举过程中已退出的 PID 不再作为候选。
  });
}
export const codexProcesses = () => processInventory().filter(item => isCodexDesktop(item.path, item.args));
export const ownNodeWorkers = script => processInventory().filter(item => /[\\/]node(?:\.exe)?$/i.test(item.path) && item.args.some(arg => path.isAbsolute(arg) && path.resolve(arg) === path.resolve(script)));

function portOwnedBy(pid, port) {
  try {
    if (process.platform === 'win32') return powershell(`@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess) | ConvertTo-Json -Compress`).match(/\d+/g)?.map(Number).includes(pid) || false;
    return Boolean(run('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).trim());
  } catch { return false; }
}
export async function readyPort(target) {
  const port = debugPort(target.args);
  if (!port || !portOwnedBy(target.pid, port)) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    const version = await response.json();
    const url = new URL(version.webSocketDebuggerUrl);
    return ['ws:', 'wss:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname) && Number(url.port) === port ? port : null;
  } catch { return null; }
}

function installedPath() {
  const configured = process.env.TEAM_CODEX_EXE || process.env.TEAM_CONTEXT_CODEX_EXE;
  const candidates = [configured, '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', '/Applications/Codex.app/Contents/MacOS/Codex'];
  if (process.platform === 'win32') {
    for (const directory of [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles]) {
      if (directory) for (const name of ['Codex', 'ChatGPT']) candidates.push(path.join(directory, name, `${name}.exe`));
    }
    try {
      const packages = JSON.parse(powershell("@(Get-AppxPackage | Where-Object { $_.Name -match 'OpenAI|ChatGPT|Codex' } | Select-Object -ExpandProperty InstallLocation) | ConvertTo-Json -Compress") || '[]');
      for (const directory of Array.isArray(packages) ? packages : [packages]) for (const name of ['Codex', 'ChatGPT']) for (const sub of ['', 'app']) candidates.push(path.join(directory, sub, `${name}.exe`));
    } catch { /* 不可见的安装包不作为启动候选。 */ }
  }
  return candidates.find(candidate => candidate && isCodexDesktop(candidate) && fs.existsSync(candidate)) || null;
}
let connectingIdentity = '', connectingSince = 0;
export async function inspectRuntime({ resolveInstalled = true } = {}) {
  const inventory = processInventory();
  const processes = inventory.filter(item => isCodexDesktop(item.path, item.args));
  const port = processes.length === 1 ? await readyPort(processes[0]) : null;
  const target = processes[0];
  const argsReliable = process.platform === 'win32' || !target || target.args.every(arg => /^--[\w-]+(?:=[^\s'"]+)?$/.test(arg));
  const snapshot = chooseRuntime(processes, port);
  if (snapshot.state === 'connecting') {
    const identity = fingerprint(target);
    if (identity !== connectingIdentity) { connectingIdentity = identity; connectingSince = Date.now(); }
    if (Date.now() - connectingSince >= 15000) snapshot.state = 'connection_failed';
  } else { connectingIdentity = ''; connectingSince = 0; }
  return { ...snapshot, argsReliable, availablePath: processes.length === 1 ? target.path : resolveInstalled ? installedPath() : null };
}

export async function gracefulClose(target) {
  const actual = codexProcesses().find(item => item.pid === target.pid);
  if (!actual || fingerprint(actual) !== fingerprint(target)) throw new Error('目标进程已变化，已取消退出');
  if (process.platform === 'win32') {
    // 只发送关闭窗口消息，不使用 Stop-Process -Force。用户的保存提示可能需要更长时间。
    const closed = powershell(`$p=Get-Process -Id ${target.pid} -ErrorAction Stop; $p.CloseMainWindow()`);
    if (!/True/i.test(closed)) throw new Error('无法请求客户端优雅退出，请手动保存并退出后重试');
  } else {
    run(nativeHelper(), ['--quit-process', String(target.pid)]);
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!codexProcesses().some(item => item.pid === target.pid)) return;
    await delay(400);
  }
  throw new Error('客户端尚未退出，可能有未保存内容。已停止操作，没有强杀或重复启动');
}
const reservePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
export async function launchDesktop(target, context = prepareLaunchContext({ availablePath: target.path })) {
  if (codexProcesses().length) throw new Error('发现新的运行实例，已取消重复启动');
  if (configurationStamp(context.env) !== context.configStamp) throw new Error('账号或网络配置已变化，已取消启动，请重新确认');
  if (!isCodexDesktop(target.path) || !fs.existsSync(target.path)) throw new Error('客户端路径无法验证');
  const port = await reservePort();
  const args = launchArguments(context.args || target.args, port);
  if (codexProcesses().length) throw new Error('发现新的运行实例，已取消重复启动');
    await new Promise((resolve, reject) => {
      const child = spawn(target.path, args, { detached: true, stdio: 'ignore', cwd: context.cwd, env: context.env, windowsHide: false });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = codexProcesses();
    if (current.length === 1 && current[0].path === target.path && await readyPort(current[0]) === port) return;
    await delay(400);
  }
  throw new Error('客户端启动请求已发送，但尚未验证调试通道；没有自动重试，请查看状态');
}
export async function restartDesktop(target, context = prepareLaunchContext({ target })) {
  if (configurationStamp(context.env) !== context.configStamp) throw new Error('配置已变化，已取消重启');
  await gracefulClose(target);
  await launchDesktop(target, context);
}
export const runtimeRoot = root;
