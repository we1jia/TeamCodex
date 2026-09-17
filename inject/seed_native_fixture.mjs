#!/usr/bin/env node
import http from "node:http";
import { CdpWebSocket } from "./cdp_websocket.mjs";

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY"]) {
  delete process.env[key];
}

const CDP_URL = process.env.TEAM_CONTEXT_CDP_URL || "http://127.0.0.1:19878";

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const targets = await getJson(`${CDP_URL.replace(/\/$/, "")}/json/list`);
const target = targets.find((item) => (
  item.type === "page" &&
  String(item.url || "").startsWith("app://") &&
  !String(item.url || "").includes("avatar-overlay") &&
  !String(item.url || "").includes("detached-window")
));
if (!target?.webSocketDebuggerUrl) throw new Error("Native Codex app page was not found.");

const ws = new CdpWebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CDP websocket open timeout")), 5000);
  ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  ws.addEventListener("error", (event) => {
    clearTimeout(timer);
    reject(event.error || new Error(event.message || "CDP websocket error"));
  }, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (event) => {
  let message;
  try { message = JSON.parse(event.data.toString()); } catch { return; }
  const item = pending.get(message.id);
  if (!item) return;
  pending.delete(message.id);
  clearTimeout(item.timer);
  if (message.error) item.reject(new Error(message.error.message || "CDP error"));
  else item.resolve(message.result);
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP command timeout: ${method}`));
    }, 5000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Runtime.enable");
let seeded = false;
for (let i = 0; i < 40; i += 1) {
  const result = await send("Runtime.evaluate", {
    expression: `(() => {
      if (!document.querySelector("aside.app-shell-left-panel")) return false;
      document.getElementById("team-context-native-fixture")?.remove();
      document.getElementById("team-context-native-fixture-v2")?.remove();
      const host = document.querySelector("main") || document.body;
      const fixture = document.createElement("div");
      fixture.id = "team-context-native-fixture-v2";
      fixture.hidden = true;
      fixture.innerHTML = \`
        <div data-app-action-sidebar-thread-id="team-context-native-fixture-thread" data-app-action-sidebar-thread-title="TeamContext 原生测试对话" data-app-action-sidebar-thread-selected="true"></div>
        <div data-message-author-role="user" data-user-message-bubble="true">请验证原生 Codex 里的 Share 不会重复发送。</div>
        <div data-markdown-text-tone="assistant-message">可以。这个回复包含一个 <a href="https://example.com">示例链接</a>。</div>
        <div data-message-author-role="user" data-user-message-bubble="true">请把下面的代码块也放进 Markdown 卡片。</div>
        <div data-markdown-text-tone="assistant-message"><pre><code>const isolated = true;
await shareContext();</code></pre></div>
      \`;
      host.appendChild(fixture);
      return true;
    })()`,
    returnByValue: true,
  });
  if (result?.result?.value) {
    seeded = true;
    break;
  }
  await delay(250);
}

console.log(JSON.stringify({ seeded }));
ws.close();
if (!seeded) process.exitCode = 1;
