#!/usr/bin/env node
import http from "node:http";
import { CdpWebSocket } from "./cdp_websocket.mjs";

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY"]) {
  delete process.env[key];
}

const CDP_URL = process.env.TEAM_CONTEXT_CDP_URL || "http://127.0.0.1:19878";
const HUB_URL = (process.env.TEAM_CONTEXT_HOST || "http://127.0.0.1:19877").replace(/\/$/, "");

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
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
if (!target?.webSocketDebuggerUrl) {
  throw new Error("Native Codex app page was not found.");
}

const ws = new CdpWebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CDP websocket open timeout")), 5000);
  ws.addEventListener("open", () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
  ws.addEventListener("error", (event) => {
    clearTimeout(timer);
    reject(event.error || new Error(event.message || "CDP websocket error"));
  }, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (event) => {
  let message;
  try {
    message = JSON.parse(event.data.toString());
  } catch {
    return;
  }
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
await send("Runtime.evaluate", {
  expression: "window.__teamContextOpenPage && window.__teamContextOpenPage()",
  returnByValue: true,
});
await delay(500);

const result = await send("Runtime.evaluate", {
  expression: `(() => {
    const tab = document.getElementById("team-context-sidebar-tab");
    const page = document.getElementById("team-context-fullscreen-page");
    const root = page?.shadowRoot;
    return {
      nativeProtocol: location.protocol,
      tabExists: Boolean(tab),
      tabText: tab?.textContent?.replace(/\\s+/g, " ").trim() || "",
      uiVersion: tab?.dataset?.ui || "",
      pageExists: Boolean(page),
      shareButtonExists: Boolean(root?.getElementById("share-thread")),
      contextCardExists: Boolean(root?.getElementById("context-select-modal")),
      roomStatusExists: Boolean(root?.getElementById("room-status-pill"))
    };
  })()`,
  returnByValue: true,
});

const state = result?.result?.value || {};
const beforeSnapshot = await getJson(`${HUB_URL}/api/snapshot?room=Media`);
const shareResult = await send("Runtime.evaluate", {
  expression: `(async () => {
    const page = document.getElementById("team-context-fullscreen-page");
    const root = page?.shadowRoot;
    root?.getElementById("share-thread")?.click();
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      cardClosed: root?.getElementById("context-select-modal")?.hidden === true
    };
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
const share = shareResult?.result?.value || {};
const afterSnapshot = await getJson(`${HUB_URL}/api/snapshot?room=Media`);
const beforeCount = Array.isArray(beforeSnapshot.messages) ? beforeSnapshot.messages.length : 0;
const afterCount = Array.isArray(afterSnapshot.messages) ? afterSnapshot.messages.length : 0;
const latestMessage = afterSnapshot.messages?.[afterSnapshot.messages.length - 1] || {};
const latestContent = String(latestMessage.content || "");
const latestMetadata = latestMessage.metadata || {};
const importResult = await send("Runtime.evaluate", {
  expression: `(async () => {
    const page = document.getElementById("team-context-fullscreen-page");
    const root = page?.shadowRoot;
    root?.getElementById("review")?.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const rows = Array.from(root?.querySelectorAll("#context-select-list .context-message-option") || []);
    if (rows.length) {
      rows[rows.length - 1].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      root?.getElementById("context-select-list")?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    }
    const selectedCount = root?.getElementById("context-select-count")?.textContent?.trim() || "";
    const preview = root?.getElementById("context-markdown-preview")?.textContent || "";
    root?.getElementById("context-select-import")?.click();
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      rows: rows.length,
      selectedCount,
      previewHasFullText: preview.includes("请验证原生 Codex 里的 Share 不会重复发送。"),
      previewHasCode: preview.includes("const isolated = true;"),
      editorText: document.querySelector(".ProseMirror")?.textContent || ""
    };
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
const imported = importResult?.result?.value || {};
const passed = (
  state.nativeProtocol === "app:" &&
  state.tabExists &&
  state.pageExists &&
  state.shareButtonExists &&
  state.contextCardExists &&
  state.roomStatusExists &&
  share.cardClosed &&
  afterCount === beforeCount + 1 &&
  latestContent.includes("请验证原生 Codex 里的 Share 不会重复发送。") &&
  latestContent.includes("可以。这个回复包含一个") &&
  latestContent.includes("const isolated = true;") &&
  latestMetadata.capture?.has_codex_response === true &&
  latestMetadata.context_window_included === false &&
  imported.rows >= 1 &&
  imported.selectedCount === "已选择 1 条消息" &&
  imported.previewHasFullText &&
  imported.previewHasCode &&
  imported.editorText.includes("导入团队空间")
);
console.log(JSON.stringify({
  passed,
  ...state,
  share,
  imported: {
    rows: imported.rows,
    selectedCount: imported.selectedCount,
    previewHasFullText: imported.previewHasFullText,
    previewHasCode: imported.previewHasCode,
    editorTextSnippet: imported.editorText.slice(0, 180)
  },
  hubMessageCount: { before: beforeCount, after: afterCount },
  capture: latestMetadata.capture || null,
  latestContentSnippet: latestContent.slice(0, 160)
}));
ws.close();
if (!passed) process.exitCode = 1;
