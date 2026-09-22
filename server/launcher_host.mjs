#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createLaunchController } from './codex_runtime_policy.mjs';
import { inspectRuntime, restartDesktop, launchDesktop, ownNodeWorkers } from './codex_runtime.mjs';
import { prepareLaunchContext } from './launch_context.mjs';
import { installationId, runtimeRevision } from './runtime_identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEAM_CODEX_LAUNCHER_PORT || 18767);
const PANEL_FILE = path.join(ROOT, "ui", "panel.html");
const DATA_DIR = process.env.TEAM_CONTEXT_DATA_DIR || path.join(ROOT, "data");
const CONFIG_FILE = path.join(DATA_DIR, "launcher.json");
const DISCOVERY_FILE = path.join(DATA_DIR, "hub_discovery.json");
const VERSION_FILE = path.join(ROOT, "version.json");
const LOG_FILE = path.join(DATA_DIR, "launcher.log");
const GITHUB_REPO = process.env.TEAM_CODEX_RELEASES_REPO || "we1jia/TeamCodex";
const BUILD_ID = 'startupfix-20260921-3';
const RUNTIME_REVISION = runtimeRevision(ROOT);
let shuttingDown = false;
let controlBusy = false;
async function runControl(operation) {
  if (controlBusy || shuttingDown) throw new Error('已有操作正在进行，请等待完成');
  controlBusy = true;
  try { return await operation(); } finally { controlBusy = false; }
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function nowIso() {
  return new Date().toISOString();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

let lastWakeTimestamp = 0;

function appVersion() {
  const v = readJson(VERSION_FILE, {});
  return String(v.version || "1.2.6");
}

function loadConfig() {
  const discovery = readJson(DISCOVERY_FILE, {});
  const saved = readJson(CONFIG_FILE, {});
  const room = saved.room || discovery.default_room || "1024";
  const roomKey =
    saved.room_key ||
    discovery.rooms?.[room]?.key ||
    discovery.known_keys?.[room] ||
    "123456";
  return {
    hub_url: String(saved.hub_url || process.env.TEAM_CONTEXT_HOST || discovery.hub_url || "http://127.0.0.1:18765").replace(/\/$/, ""),
    room: String(room),
    room_key: String(roomKey || ""),
  };
}

function saveConfig(partial) {
  const next = { ...loadConfig(), ...Object.fromEntries(Object.entries(partial).filter(([, value]) => value !== undefined)), updated_at: nowIso() };
  writeJson(CONFIG_FILE, next);
  const discovery = readJson(DISCOVERY_FILE, {});
  discovery.hub_url = next.hub_url;
  discovery.default_room = next.room;
  discovery.rooms = discovery.rooms || {};
  discovery.rooms[next.room] = { ...(discovery.rooms[next.room] || {}), key: next.room_key };
  discovery.known_keys = discovery.known_keys || {};
  discovery.known_keys[next.room] = next.room_key;
  discovery.updated_at = nowIso();
  writeJson(DISCOVERY_FILE, discovery);
  return next;
}

function requestJson(url, timeout = 2500) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.get(parsed, { timeout, headers: { "User-Agent": "TeamCodex-Launcher" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(body || "{}") });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function parseVersion(raw) {
  return String(raw || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

let updateCache = { at: 0, value: null };

async function checkUpdate({ force = false } = {}) {
  const current = appVersion();
  if (!force && updateCache.value && Date.now() - updateCache.at < 5 * 60 * 1000) {
    return { ...updateCache.value, current };
  }
  const empty = {
    current,
    latest: current,
    has_update: false,
    url: `https://github.com/${GITHUB_REPO}/releases/latest`,
    notes: "",
    asset: null,
  };
  try {
    const { status, body } = await requestJson(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      6000,
    );
    if (status !== 200 || !body?.tag_name) {
      return { ...empty, check_failed: true, message: `GitHub API 响应异常 (${status || "无响应"})` };
    }
    const latest = String(body.tag_name).replace(/^v/i, "");
    const want = process.platform === "darwin" ? "TeamCodex-macOS.dmg" : "TeamCodex-Setup.exe";
    const asset = (body.assets || []).find((item) => item.name === want) || null;
    const value = {
      current,
      latest,
      has_update: isNewer(latest, current),
      url: body.html_url || empty.url,
      notes: String(body.body || "").slice(0, 800),
      asset: asset
        ? { name: asset.name, url: asset.browser_download_url, size: asset.size }
        : null,
    };
    updateCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    return { ...empty, check_failed: true, message: "无法连接 GitHub Releases (网络连接超时)" };
  }
}

function isAttachRunning() {
  try { return ownNodeWorkers(path.join(ROOT, 'inject/attach_codex.mjs')).length > 0; } catch { return false; }
}

async function stopAttach() {
  const workers = ownNodeWorkers(path.join(ROOT, 'inject/attach_codex.mjs'));
  for (const worker of workers) {
    const fresh = ownNodeWorkers(path.join(ROOT, 'inject/attach_codex.mjs')).find(item => item.pid === worker.pid && item.startedAt === worker.startedAt);
    if (fresh) { try { process.kill(fresh.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    if (!isAttachRunning()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('本安装目录的注入器尚未退出，停止重复启动');
}

let attachOperation = Promise.resolve();
function queueAttachOperation(operation) {
  const result = attachOperation.then(operation);
  attachOperation = result.catch(() => {});
  return result;
}

function startAttach(options = {}) {
  return queueAttachOperation(() => {
    if (shuttingDown) throw new Error('TeamCodex 正在退出，请稍后重新打开');
    return restartAttach(options);
  });
}

async function restartAttach({ allowUiUpdate = false } = {}) {
  const cfg = loadConfig();
  await stopAttach();
  const attachLogPath = path.join(DATA_DIR, "attach.log");
  let outFd = "ignore";
  try {
    fs.mkdirSync(path.dirname(attachLogPath), { recursive: true });
    outFd = fs.openSync(attachLogPath, "a");
  } catch {}
  const child = spawn(process.execPath, [path.join(ROOT, "inject", "attach_codex.mjs")], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", outFd, outFd],
    env: {
      ...process.env,
      TEAM_CONTEXT_HOST: cfg.hub_url,
      TEAM_CONTEXT_DEFAULT_ROOM: cfg.room,
      TEAM_CONTEXT_DEFAULT_ROOM_KEY: cfg.room_key,
      TEAM_CONTEXT_ALLOW_UI_UPDATE: allowUiUpdate ? '1' : '0',
      TEAM_CONTEXT_DATA_DIR: DATA_DIR,
    },
  });
  if (typeof outFd === 'number') fs.closeSync(outFd);
  child.unref();
}

// 不接管其他软件的账号、代理和进程；只执行本控制面确认过的目标操作。
const launchController = createLaunchController({
  inspect: inspectRuntime,
  restart: restartDesktop,
  launch: launchDesktop,
  attach: () => startAttach(),
  prepare: prepareLaunchContext,
});

async function hubHealth(hubUrl) {
  try {
    const { status, body } = await requestJson(`${hubUrl.replace(/\/$/, "")}/api/health`, 1500);
    if (status === 200 && body?.ok) return body;
  } catch {}
  return null;
}

async function codexStatus() {
  const runtime = await inspectRuntime().catch(error => ({ state: 'unknown', target: null, message: error.message }));
  const receipt = readJson(path.join(DATA_DIR, 'attach-state.json'), {});
  const fresh = Date.now() - Number(receipt.updatedAt || 0) < 12000;
  const sameTarget = runtime.target && runtime.target.pid === receipt.targetPid && runtime.port === receipt.port;
  return {
    running: runtime.state === 'unknown' ? null : runtime.state !== 'not_running', state: runtime.state,
    injected: runtime.state === 'ready' && fresh && sameTarget && receipt.installed === true,
    ui_version: sameTarget ? receipt.uiVersion || '' : '', pending_update: sameTarget && receipt.pendingUpdate === true,
    message: runtime.message || (runtime.state === 'restart_required' ? '需要重新打开 Codex 才能挂载' : runtime.state === 'connection_failed' ? '连接超时，可确认重启后恢复挂载' : runtime.state === 'connecting' ? '正在连接 Codex，请稍候' : runtime.state === 'ambiguous' ? '检测到多个 Codex，请保留一个目标实例后重试' : receipt.message || ''),
  };
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...cors(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(shuttingDown ? { Connection: 'close' } : {}),
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function openUpdate(update) {
  const target = update.asset?.url || update.url;
  if (!target) throw new Error("没有可打开的更新地址");
  if (process.platform === "darwin") {
    spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
  }
  return target;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors());
    res.end();
    return;
  }
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    const trustedOrigins = ['http://127.0.0.1:' + PORT, 'http://localhost:' + PORT];
    if (origin && !trustedOrigins.includes(origin)) return sendJson(res, 403, { ok: false, message: '仅允许本机控制面发起操作' });
    if (shuttingDown) return sendJson(res, 409, { ok: false, message: 'TeamCodex 正在退出，请稍后重新打开' });
  }

  if (req.method === 'GET' && url.pathname === '/api/runtime') {
    return sendJson(res, 200, { service: 'teamcodex-launcher', installation: installationId(ROOT), revision: RUNTIME_REVISION, pid: process.pid, shutting_down: shuttingDown });
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/panel.html")) {
    fs.readFile(PANEL_FILE, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("panel not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    const cfg = loadConfig();
    const [hub, codex, update] = await Promise.all([hubHealth(cfg.hub_url), codexStatus(), checkUpdate()]);
    sendJson(res, 200, {
      ok: true,
      app_version: appVersion(),
      build_id: BUILD_ID,
      busy: controlBusy || shuttingDown,
      hub: {
        ok: Boolean(hub),
        url: cfg.hub_url,
        version: hub?.version || "",
        lanUrl: hub?.lanUrl || cfg.hub_url,
      },
      codex,
      room: { id: cfg.room, key_set: Boolean(cfg.room_key) },
      update,
      last_wake: lastWakeTimestamp,
    });
    return;
  }

  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/wake") {
    lastWakeTimestamp = Date.now();
    sendJson(res, 200, { ok: true, message: "TeamCodex is awake", timestamp: lastWakeTimestamp });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/token") {
    const cfg = loadConfig();
    const hub = await hubHealth(cfg.hub_url);
    const hubUrl = hub?.lanUrl || cfg.hub_url;
    const token = `Hub: ${hubUrl} | Room: ${cfg.room} | Key: ${cfg.room_key || ""}`;
    sendJson(res, 200, { ok: true, token, hub_url: hubUrl, room: cfg.room });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/update") {
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    sendJson(res, 200, await checkUpdate({ force }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hub") {
    let body = {};
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, error: "invalid json" });
    }
    const hubUrl = String(body.hub_url || "").trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(hubUrl)) {
      return sendJson(res, 400, { ok: false, error: "invalid_hub_url", message: "中枢地址需要 http 或 https" });
    }
    try {
      const cfg = await runControl(async () => {
        const saved = saveConfig({
      hub_url: hubUrl,
      room: body.room ? String(body.room) : undefined,
      room_key: body.room_key != null ? String(body.room_key) : undefined,
        });
        await startAttach();
        return saved;
      });
      sendJson(res, 200, { ok: true, ...cfg });
    } catch { sendJson(res, 409, { ok: false, message: '设置操作未完成，请检查状态后重试' }); }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/restart-inject") {
    try {
      const runtime = await inspectRuntime();
      if (runtime.state !== 'ready') return sendJson(res, 409, { ok: false, message: '当前 Codex 暂时无法挂载，请使用上方启动按钮检查并确认恢复；重新挂载不会重启 Codex。' });
      const body = JSON.parse((await readBody(req)) || '{}');
      await runControl(() => startAttach({ allowUiUpdate: body.allowUiUpdate === true }));
      sendJson(res, 200, { ok: true, message: '注入器已启动；只等待当前实例，不会重启 Codex' });
    } catch (error) { sendJson(res, 409, { ok: false, message: error.message }); }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/shutdown') {
    if (controlBusy) return sendJson(res, 409, { ok: false, message: '操作尚未结束，请完成后再退出 TeamCodex' });
    shuttingDown = true;
    sendJson(res, 202, { ok: true, message: '正在退出本安装控制面和注入器；共享 Hub 与 Codex 保留' });
    queueAttachOperation(stopAttach).then(() => {
      server.close(() => process.exit(0));
      server.closeIdleConnections();
    }).catch(error => { shuttingDown = false; console.error('[shutdown]', error.message); });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/start-codex') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const result = await runControl(() => launchController.request(body));
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, error.status || 500, { ok: false, message: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/update/download") {
    const update = await checkUpdate();
    if (!update.has_update) return sendJson(res, 200, { ok: true, skipped: true, message: "已是最新版本" });
    try { sendJson(res, 200, { ok: true, dest: openUpdate(update) }); }
    catch (error) { sendJson(res, 500, { ok: false, error: error.message }); }
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  const line = `${nowIso()} launcher_host listening on http://127.0.0.1:${PORT}`;
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch {}
  console.log(line);
  if (process.env.TEAM_CODEX_NO_ATTACH !== '1') startAttach().catch(error => console.error('[attach]', error.message));
});
