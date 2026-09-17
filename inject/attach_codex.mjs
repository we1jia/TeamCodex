#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CdpWebSocket } from "./cdp_websocket.mjs";
import {
  assertSafeCodexUiTarget,
  parseDebuggingPortFromCommand,
  parsePort,
} from "./safety.mjs";

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY"]) {
  delete process.env[key];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INJECT_FILE = path.join(ROOT, "inject", "sidebar_fullscreen.js");
const HOST_URL = process.env.TEAM_CONTEXT_HOST || "http://127.0.0.1:18765";
const CHATGPT_BIN = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
const FALLBACK_CDP_PORT = Number(process.env.TEAM_CONTEXT_CDP_PORT || 18766);

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

function listChatGptCommands() {
  if (process.platform === "win32") {
    try {
      const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name like '%ChatGPT%' or Name like '%Codex%'\" | Select-Object -ExpandProperty CommandLine"], { encoding: "utf8" });
      return output.split("\n").map((l) => l.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  try {
    const output = execFileSync("/bin/ps", ["-ax", "-o", "pid=", "-o", "command="], {
      encoding: "utf8",
    });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("ChatGPT.app/Contents/MacOS/ChatGPT"));
  } catch {
    return [];
  }
}

function discoverCdpPort() {
  if (process.env.TEAM_CONTEXT_CDP_URL) {
    const parsed = new URL(process.env.TEAM_CONTEXT_CDP_URL);
    return parsePort(parsed.port);
  }
  for (const command of listChatGptCommands()) {
    const port = parseDebuggingPortFromCommand(command);
    if (port) return port;
  }
  return null;
}

function injectSource() {
  const script = fs.readFileSync(INJECT_FILE, "utf8");
  const defaultRoom = process.env.TEAM_CONTEXT_DEFAULT_ROOM || "1024";
  const defaultRoomKey = process.env.TEAM_CONTEXT_DEFAULT_ROOM_KEY || "123456";
  return `document.querySelectorAll('#team-context-fullscreen-page iframe, iframe[src*="127.0.0.1:18765"]').forEach((node) => node.remove());
window.__TEAM_CONTEXT_HOST__=${JSON.stringify(HOST_URL)};
window.__TEAM_CONTEXT_OS__=${JSON.stringify(process.platform)};
window.__TEAM_CONTEXT_DEFAULT_ROOM__=${JSON.stringify(defaultRoom)};
window.__TEAM_CONTEXT_DEFAULT_ROOM_KEY__=${JSON.stringify(defaultRoomKey)};
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

function executeNativeRpc(reqPayload) {
  const { id, path, method = "GET", headers = {}, body = null, hubUrl = null } = reqPayload;
  return new Promise((resolve) => {
    const hub = (hubUrl || HOST_URL).replace(/\/$/, "");
    const fullUrl = new URL(path.startsWith("http") ? path : `${hub}${path}`);
    const data = body ? (typeof body === "string" ? body : JSON.stringify(body)) : null;
    const reqHeaders = {
      ...headers,
    };
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
            console.log("[attach_codex] bindingCalled payload:", msg.params.payload);
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
    const result = await session.send("Runtime.evaluate", {
      expression: source,
      returnByValue: true,
    });
    const pageState = await session.send("Runtime.evaluate", {
      expression: "(() => ({ pending: window.__teamContextTakePending ? window.__teamContextTakePending() : null, config: window.__teamContextGetConfig ? window.__teamContextGetConfig() : null, pendingConfig: window.__teamContextPendingConfig || null, pendingCalls: window.__teamContextTakePendingCalls ? window.__teamContextTakePendingCalls() : null }))()",
      returnByValue: true,
    });
    const state = pageState?.result?.value || {};
    const payload = state.pending;
    const currentRoom = state.config?.roomId || defaultRoom || "1024";
    const currentKey = state.config?.roomKey || defaultRoomKey || "123456";

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
      // 彻底移除每 1.5 秒从本地静态 HOST_URL 拉取快照并强行 evaluate window.__teamContextApply(snap) 的死循环覆盖逻辑，
      // 快照与在线状态由前端根据自身连接的 Hub 主动拉取与 SSE 实时同步维护
    } catch (syncErr) {
      console.warn(`[attach_codex] snapshot/sync failed (host=${targetHost}): ${syncErr.message}`);
      return { installed: true, syncError: syncErr.message };
    }
    return result?.result?.value || result;
  } catch (error) {
    console.warn(`[attach_codex] cdp session error on target ${target.id}: ${error.message}`);
    session?.close();
    sessions.delete(target.id);
    return { installed: false, syncError: error.message };
  }
}

async function attachLoop(port) {
  const safety = assertSafeCodexUiTarget({
    cdpUrl: `http://127.0.0.1:${port}`,
    listenPorts: listListenPorts(),
  });
  if (!safety.ok) {
    console.error(safety.reason);
    process.exit(2);
  }
  const sessions = new Map();
  console.log(`attach Codex CDP http://127.0.0.1:${port} host=${HOST_URL}`);
  let lastOk = "";
  for (;;) {
    try {
      const source = injectSource();
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
      const pages = targets.filter(isCodexPage);
      const activeIds = new Set(pages.map((p) => p.id));
      for (const [id, s] of sessions.entries()) {
        if (!activeIds.has(id)) {
          s?.close();
          sessions.delete(id);
        }
      }
      for (const target of pages) {
        const value = await injectTarget(target, source, sessions);
        if (value?.reason === "not-codex-sidebar") continue;
        const summary = `${target.title || target.id}: ${JSON.stringify(value)}`;
        if (summary !== lastOk) {
          console.log(summary);
          lastOk = summary;
        }
      }
    } catch (error) {
      console.error(`inject retry: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

function waitForPort(port, attempts = 40) {
  return new Promise((resolve, reject) => {
    const tryOnce = async (left) => {
      try {
        await getJson(`http://127.0.0.1:${port}/json/version`);
        resolve();
      } catch (error) {
        if (left <= 0) reject(error);
        else setTimeout(() => tryOnce(left - 1), 250);
      }
    };
    tryOnce(attempts);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCodexRestart() {
  console.error("Codex 当前没有调试端口。不会打断现有实例；请退出当前 Codex，启动器会在退出后自动重新打开可注入实例。");
  for (;;) {
    const discovered = discoverCdpPort();
    if (discovered) return discovered;
    if (!listChatGptCommands().length) return null;
    await sleep(1000);
  }
}

async function main() {
  let port = discoverCdpPort();
  const chatGptRunning = listChatGptCommands().length > 0;
  if (!port && chatGptRunning) {
    port = await waitForCodexRestart();
  }
  if (!port) {
    let clientBin = CHATGPT_BIN;
    if (process.platform === "win32") {
      clientBin = process.env.TEAM_CODEX_EXE || path.join(process.env.LOCALAPPDATA || "", "Programs", "ChatGPT", "ChatGPT.exe");
    }
    if (!fs.existsSync(clientBin)) {
      console.error(`找不到客户端可执行文件: ${clientBin}`);
      process.exit(4);
    }
    console.log(`starting ChatGPT with --remote-debugging-port=${FALLBACK_CDP_PORT}`);
    const child = spawn(
      clientBin,
      ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${FALLBACK_CDP_PORT}`],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    port = FALLBACK_CDP_PORT;
    await waitForPort(port);
  }
  await attachLoop(port);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
