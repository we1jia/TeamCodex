#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CdpWebSocket } from "./cdp_websocket.mjs";
import { inspectRuntime } from '../server/codex_runtime.mjs';
import { fingerprint, hotUpdateDecision } from '../server/codex_runtime_policy.mjs';
const consumedUpdates = new Set();
import {
  assertSafeCodexUiTarget,
  parsePort,
} from "./safety.mjs";

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY"]) {
  delete process.env[key];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INJECT_FILE = path.join(ROOT, "inject", "sidebar_fullscreen.js");
const HOST_URL = process.env.TEAM_CONTEXT_HOST || "http://127.0.0.1:18765";
const DEFAULT_ROOM = process.env.TEAM_CONTEXT_DEFAULT_ROOM || "1024";
const DEFAULT_ROOM_KEY = process.env.TEAM_CONTEXT_DEFAULT_ROOM_KEY || "123456";

function getJson(url) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(url);
    const transport = fullUrl.protocol === "https:" ? https : http;
    const req = transport.get(fullUrl, { timeout: 2000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function getText(url) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(url);
    const transport = fullUrl.protocol === "https:" ? https : http;
    const req = transport.get(fullUrl, { timeout: 2500 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`http ${res.statusCode}`));
          return;
        }
        resolve(body);
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

let cachedRemoteScript = "";
let cachedRemoteAt = 0;
const REMOTE_SCRIPT_TTL_MS = 20000;

async function resolveInjectScript() {
  const now = Date.now();
  if (cachedRemoteScript && now - cachedRemoteAt < REMOTE_SCRIPT_TTL_MS) {
    return cachedRemoteScript;
  }
  try {
    const remote = await getText(`${HOST_URL.replace(/\/$/, "")}/inject/sidebar_fullscreen.js`);
    if (remote && remote.includes("team-context-sidebar-tab") && remote.includes("connectHub")) {
      cachedRemoteScript = remote;
      cachedRemoteAt = now;
      return remote;
    }
  } catch {}
  const { workspaceBundle } = await import('../server/workspace_bundle.mjs');
  return workspaceBundle(ROOT) + fs.readFileSync(INJECT_FILE, "utf8");
}

function postJson(url, payload) {
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(url);
    const transport = fullUrl.protocol === "https:" ? https : http;
    const req = transport.request(
      fullUrl,
      {
        method: "POST",
        timeout: 3000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body || "{}"));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("postJson timeout"));
    });
    req.write(data);
    req.end();
  });
}

function listListenPorts() {
  if (process.platform === "win32") {
    try {
      const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
      return output
        .split(/\r?\n/)
        .filter((l) => l.includes("LISTENING"))
        .map((l) => {
          const parts = l.trim().split(/\s+/);
          const port = parsePort(parts[1]?.split(":").pop());
          return { command: "tcp", port };
        })
        .filter((item) => item.port);
    } catch {
      return [];
    }
  }
  try {
    const output = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    return output
      .split("\n")
      .slice(1)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const name = parts[parts.length - 1] || "";
        const port = parsePort(name.split(":").pop()?.replace(/\(LISTEN\)/, ""));
        return { command: parts[0] || "", port };
      })
      .filter((item) => item.port);
  } catch {
    return [];
  }
}

// 当前进程/端口由只读 runtime 检查提供，不缓存已经退出的 Codex 实例。

function injectSource(script) {
  return `document.querySelectorAll('#team-context-fullscreen-page iframe, iframe[src*="127.0.0.1:18765"]').forEach((node) => node.remove());
window.__TEAM_CONTEXT_HOST__=${JSON.stringify(HOST_URL)};
window.__TEAM_CONTEXT_OS__=${JSON.stringify(process.platform)};
window.__TEAM_CONTEXT_DEFAULT_ROOM__=${JSON.stringify(DEFAULT_ROOM)};
window.__TEAM_CONTEXT_DEFAULT_ROOM_KEY__=${JSON.stringify(DEFAULT_ROOM_KEY)};
${script}`;
}


function connect(webSocketDebuggerUrl) {
  const WebSocketImpl = globalThis.WebSocket || CdpWebSocket;
  const ws = new WebSocketImpl(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  const rejectAllPending = (err) => {
    for (const [id, item] of pending.entries()) {
      if (item.timer) clearTimeout(item.timer);
      item.reject(err);
    }
    pending.clear();
  };

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("cdp websocket connect timeout"));
    }, 4000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    ws.addEventListener("error", (e) => {
      clearTimeout(timer);
      reject(new Error(e?.message || "cdp websocket error"));
    }, { once: true });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      reject(new Error("cdp websocket closed before open"));
    }, { once: true });
  });

  const eventListeners = new Set();

  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data.toString());
      if (message.method) {
        for (const listener of eventListeners) {
          try { listener(message); } catch {}
        }
      }
      if (message.id == null || !pending.has(message.id)) return;
      const { resolve, reject, timer } = pending.get(message.id);
      if (timer) clearTimeout(timer);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "cdp error"));
      else resolve(message.result);
    } catch {}
  });

  ws.addEventListener("close", () => {
    rejectAllPending(new Error("cdp websocket closed"));
  });

  ws.addEventListener("error", (e) => {
    rejectAllPending(new Error(e?.message || "cdp websocket error"));
  });

  return {
    ws,
    ready,
    onEvent(fn) {
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
    send(method, params = {}, timeoutMs = 4000) {
      if (ws.readyState !== 1) {
        return Promise.reject(new Error("cdp websocket not open"));
      }
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`cdp send timeout (${method})`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          ws.send(JSON.stringify({ id, method, params }));
        } catch (err) {
          clearTimeout(timer);
          pending.delete(id);
          reject(err);
        }
      });
    },
    close() {
      try {
        ws.close();
      } catch {}
      rejectAllPending(new Error("cdp session closed"));
    },
  };
}

function isCodexPage(target) {
  if (target.type !== "page") return false;
  const url = String(target.url || "");
  const title = String(target.title || "");
  if (url.startsWith("devtools://") || url.startsWith("chrome-extension://")) return false;
  return url.startsWith("app://") || /Codex|ChatGPT/i.test(title) || /index\.html|mock-codex/i.test(url);
}

// 原生 binding 与轮询兜底可能同时拿到同一个调用，写操作只能执行一次。
const nativeRpcRequests = new Map();
function executeNativeRpc(reqPayload) {
  const key = `${reqPayload.hubUrl || HOST_URL}:${reqPayload.id}`;
  const existing = nativeRpcRequests.get(key);
  if (existing) return existing;
  const pending = performNativeRpc(reqPayload);
  nativeRpcRequests.set(key, pending);
  pending.finally(() => {
    while (nativeRpcRequests.size > 64) nativeRpcRequests.delete(nativeRpcRequests.keys().next().value);
  });
  return pending;
}

function performNativeRpc(reqPayload) {
  const { id, path, method = "GET", headers = {}, body = null, hubUrl = null } = reqPayload;
  return new Promise((resolve) => {
    const hub = (hubUrl || HOST_URL).replace(/\/$/, "");
    const fullUrl = new URL(path.startsWith("http") ? path : `${hub}${path}`);
    const data = body ? (typeof body === "string" ? body : JSON.stringify(body)) : null;
    const reqHeaders = {};
    for (const [k, v] of Object.entries(headers || {})) {
      if (v == null) continue;
      const strVal = String(v);
      const isAscii = /^[\x20-\x7E]*$/.test(strVal);
      reqHeaders[k] = isAscii ? strVal : encodeURIComponent(strVal);
    }
    if (data) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(data);
    }
    const transport = fullUrl.protocol === "https:" ? https : http;
    const req = transport.request(fullUrl, {
      method,
      headers: reqHeaders,
      timeout: 8000,
    }, (res) => {
      let resBody = "";
      res.on("data", (chunk) => { resBody += chunk; });
      res.on("end", () => {
        let parsed = resBody;
        try { parsed = JSON.parse(resBody); } catch {}
        resolve({
          id,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data: parsed,
        });
      });
    });
    req.on("error", (err) => {
      resolve({
        id,
        ok: false,
        status: 500,
        error: err.message,
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    if (data) req.write(data);
    req.end();
  });
}

async function injectTarget(target, source, sessions) {
  let session = sessions.get(target.id);
  if (!session || session.ws.readyState !== 1) {
    session?.close();
    session = connect(target.webSocketDebuggerUrl);
    try {
      await session.ready;
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await session.send("Runtime.addBinding", { name: "__teamContextNativeCall" }).catch(() => {});
      await session.send("Page.setBypassCSP", { enabled: true }).catch(() => {});

      // 监听即时原生 Binding 调用
      session.onEvent(async (msg) => {
        if (msg.method === "Runtime.bindingCalled" && msg.params?.name === "__teamContextNativeCall") {
          try {
            const payload = JSON.parse(msg.params.payload || "{}");
            if (payload && payload.id) {
              const resp = await executeNativeRpc(payload);
              console.log("[attach_codex] binding response:", resp.id, resp.status);
              session.send("Runtime.evaluate", {
                expression: `window.__teamContextOnNativeResponse && window.__teamContextOnNativeResponse(${JSON.stringify(resp.id)}, ${JSON.stringify(resp)})`,
              }).catch(() => {});
            }
          } catch (e) {
            console.error("[attach_codex] native binding call failed:", e);
          }
        }
      });

      sessions.set(target.id, session);
    } catch (err) {
      session?.close();
      sessions.delete(target.id);
      return { installed: false, reason: "connect-failed", error: err.message };
    }
  }
  try {
    await session.send("Runtime.addBinding", { name: "__teamContextNativeCall" }).catch(() => {});
    const probe = await session.send("Runtime.evaluate", {
      expression: `!!document.querySelector('aside.app-shell-left-panel nav[role="navigation"]')`,
      returnByValue: true,
    });
    if (probe?.result?.value !== true) {
      return { installed: false, reason: "not-codex-sidebar" };
    }
    const targetUiVersionMatch = source.match(/UI_VERSION\s*=\s*["']([^"']+)["']/);
    const targetUiVersion = targetUiVersionMatch ? targetUiVersionMatch[1] : "";

    // 轻量探针检测：若已安装且版本一致且侧栏 Tab 节点存在，跳过重复 Evaluate；若版本过旧或节点不存在，自动热更新注入
    const probeState = await session.send("Runtime.evaluate", {
      expression: `(() => ({
        installed: Boolean(window.__teamContextTabInstalled && document.getElementById('team-context-sidebar-tab')),
        version: window.__teamContextUiVersion || ""
      }))()`,
      returnByValue: true,
    }).catch(() => null);

    const pageProbe = probeState?.result?.value;
    let result = null;
    const allowUpdate = process.env.TEAM_CONTEXT_ALLOW_UI_UPDATE === '1' && !consumedUpdates.has(target.id);
    const action = hotUpdateDecision({ installed: pageProbe?.installed, currentVersion: pageProbe?.version, nextVersion: targetUiVersion, allowUpdate });
    if (action !== 'keep' && action !== 'defer') {
      result = await session.send('Runtime.evaluate', { expression: source, returnByValue: true });
      consumedUpdates.add(target.id);
    }
    const pageState = await session.send("Runtime.evaluate", {
      expression: "(() => ({ pending: window.__teamContextTakePending ? window.__teamContextTakePending() : null, config: window.__teamContextGetConfig ? window.__teamContextGetConfig() : null, pendingConfig: window.__teamContextPendingConfig || null, pendingCalls: window.__teamContextTakePendingCalls ? window.__teamContextTakePendingCalls() : null }))()",
      returnByValue: true,
    });
    const state = pageState?.result?.value || {};
    const payload = state.pending;
    const currentRoom = state.config?.roomId || DEFAULT_ROOM || "1024";
    const currentKey = state.config?.roomKey || DEFAULT_ROOM_KEY || "123456";

    // 轮询队列兜底处理挂起的 RPC 调用
    if (Array.isArray(state.pendingCalls) && state.pendingCalls.length > 0) {
      console.log("[attach_codex] pendingCalls batch count:", state.pendingCalls.length);
      for (const callReq of state.pendingCalls) {
        if (callReq && callReq.id) {
          console.log("[attach_codex] processing pending call:", callReq.id, callReq.path);
          executeNativeRpc(callReq).then((resp) => {
            console.log("[attach_codex] pending call completed:", resp.id, resp.status);
            session.send("Runtime.evaluate", {
              expression: `window.__teamContextOnNativeResponse && window.__teamContextOnNativeResponse(${JSON.stringify(resp.id)}, ${JSON.stringify(resp)})`,
            }).catch(() => {});
          }).catch(() => {});
        }
      }
    }

    if (state.pendingConfig) {
      const cfg = state.pendingConfig;
      const targetHost = (cfg.hubUrl || HOST_URL).replace(/\/$/, "");
      try {
        const verifyRes = await postJson(`${targetHost}/api/rooms/verify`, {
          room: cfg.roomId,
          room_key: cfg.roomKey,
          auto_create: true,
        });
        await session.send("Runtime.evaluate", {
          expression: `window.__teamContextApplyConfigResult && window.__teamContextApplyConfigResult(${JSON.stringify({ ok: true, data: verifyRes })}); window.__teamContextPendingConfig = null;`,
        });
      } catch (err) {
        await session.send("Runtime.evaluate", {
          expression: `window.__teamContextApplyConfigResult && window.__teamContextApplyConfigResult(${JSON.stringify({ ok: false, error: err.message })}); window.__teamContextPendingConfig = null;`,
        });
      }
    }

    const message = payload?.message || (payload?.content ? payload : null);
    const targetHost = (state.config?.hubUrl || HOST_URL).replace(/\/$/, "");
    let syncError = '';
    try {
      if (message?.content) {
        await postJson(`${targetHost}/api/messages`, {
          ...message,
          room: currentRoom,
          room_key: currentKey,
        });
      }
      if (payload?.context) {
        await postJson(`${targetHost}/api/context`, {
          ...payload.context,
          room: currentRoom,
          room_key: currentKey,
        });
      }
      const cfg = state.config || {};
      const lastSeq = Number(cfg.lastSeq || 0);
      const memberQs = `${currentKey ? `&room_key=${encodeURIComponent(currentKey)}` : ""}&member_id=${encodeURIComponent(cfg.memberId || "")}&member_name=${encodeURIComponent(cfg.nickname || "")}&client_id=${encodeURIComponent(cfg.clientId || "")}`;
      const snap = await getJson(`${targetHost}/api/snapshot?room=${encodeURIComponent(currentRoom)}${memberQs}`);
      const fresh = lastSeq > 0
        ? (snap.messages || []).filter((item) => Number(item.seq || 0) > lastSeq)
        : [];
      if (fresh.length || Array.isArray(snap.active_members) || typeof snap.online_count === "number") {
        const delta = {
          messages: fresh,
          members: snap.members || [],
          active_members: snap.active_members || [],
          online_count: snap.online_count,
          seq: snap.seq,
          room: snap.room,
        };
        await session.send("Runtime.evaluate", {
          expression: `window.__teamContextIngestMessages && window.__teamContextIngestMessages(${JSON.stringify(delta)})`,
        });
      }
    } catch (syncErr) {
      console.warn(`[attach_codex] snapshot/sync failed (host=${targetHost}): ${syncErr.message}`);
      syncError = syncErr.message;
    }
    const receipt = await session.send('Runtime.evaluate', {
      expression: "({installed:!!window.__teamContextTabInstalled && !!document.getElementById('team-context-sidebar-tab'),ui:window.__teamContextUiVersion||''})",
      returnByValue: true,
    });
    return { ...(receipt?.result?.value || { installed: false }), pendingUpdate: action === 'defer' || result?.result?.value?.pendingUpdate === true, ...(syncError ? { syncError } : {}) };
  } catch (error) {
    console.warn(`[attach_codex] cdp session error on target ${target.id}: ${error.message}`);
    session?.close();
    sessions.delete(target.id);
    return { installed: false, syncError: error.message };
  }
}

function writeAttachState(state) {
  const directory = process.env.TEAM_CONTEXT_DATA_DIR || path.join(ROOT, 'data');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'attach-state.json');
  const temporary = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify({ ...state, updatedAt: Date.now(), injectorPid: process.pid }));
  fs.renameSync(temporary, file);
}

async function main() {
  const sessions = new Map();
  let previousTarget = '';
  let stopped = false;
  const close = () => { stopped = true; for (const session of sessions.values()) session.close(); sessions.clear(); };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
  while (!stopped) {
    try {
      const runtime = await inspectRuntime({ resolveInstalled: false });
      const identity = runtime.target ? fingerprint(runtime.target) : '';
      if (runtime.state !== 'ready' || identity !== previousTarget) {
        for (const session of sessions.values()) session.close();
        sessions.clear();
      }
      previousTarget = identity;
      if (runtime.state !== 'ready') {
        writeAttachState({ installed: false, state: runtime.state, targetPid: runtime.target?.pid || null, message: '等待当前实例的调试通道；不会自行启动或重启 Codex' });
      } else {
        const port = runtime.port;
        const safety = assertSafeCodexUiTarget({ cdpUrl: 'http://127.0.0.1:' + port, listenPorts: listListenPorts() });
        if (!safety.ok) throw new Error(safety.reason);
        const source = injectSource(await resolveInjectScript());
        const targets = await getJson('http://127.0.0.1:' + port + '/json/list');
        const pages = targets.filter(isCodexPage);
        const activeIds = new Set(pages.map(page => page.id));
        for (const [id, session] of sessions) if (!activeIds.has(id)) { session.close(); sessions.delete(id); }
        let installed = false, pendingUpdate = false, uiVersion = '';
        for (const target of pages) {
          // 调试连接期间发生切号时，丢弃旧结果，不能向旧目标继续注入。
          const latest = await inspectRuntime({ resolveInstalled: false });
          if (latest.state !== 'ready' || fingerprint(latest.target) !== identity || latest.port !== port) throw new Error('目标实例已变化，等待重新绑定');
          const value = await injectTarget(target, source, sessions);
          installed ||= value?.installed === true;
          pendingUpdate ||= value?.pendingUpdate === true;
          if (value?.ui) uiVersion = value.ui;
        }
        writeAttachState({ installed, pendingUpdate, uiVersion, state: installed ? 'attached' : 'waiting_page', targetPid: runtime.target.pid, port });
      }
    } catch (error) {
      for (const session of sessions.values()) session.close();
      sessions.clear();
      writeAttachState({ installed: false, state: 'waiting', message: String(error.message).slice(0, 250) });
    }
    if (!stopped) await new Promise(resolve => setTimeout(resolve, 2500));
  }
  writeAttachState({ installed: false, state: 'stopped' });
}

main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
