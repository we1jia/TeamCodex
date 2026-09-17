import http from "node:http";
import fs from "node:fs";

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY"]) {
  delete process.env[key];
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

const targets = await getJson("http://127.0.0.1:18766/json/list");
const target = targets.find((t) => t.id === "18DC197140B8FAF5B4BE57044ACDD9AD");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let nextId = 1;
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const msg = JSON.parse(event.data.toString());
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// 1. 确保打开全屏工作台
await send("Runtime.evaluate", {
  expression: `window.__teamContextOpenPage && window.__teamContextOpenPage();`,
});
await new Promise(r => setTimeout(r, 600));

// 2. 检查 DOM 稳定性（连续等待 3 秒看 DOM 节点是否被反复摧毁）
const stabilityCheck = await send("Runtime.evaluate", {
  expression: `(async () => {
    const root = document.getElementById("team-context-fullscreen-page")?.shadowRoot;
    const people = root?.getElementById("people");
    const firstBefore = people?.firstElementChild;
    await new Promise(r => setTimeout(r, 2000));
    const firstAfter = people?.firstElementChild;
    return {
      sameNode: firstBefore === firstAfter,
      peopleChildrenCount: people?.children.length
    };
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log("Anti-flicker stability check:", stabilityCheck.result?.value);

// 3. 截取带有「📤 分享当前对话」和「📥 导入到 AI」工具条的当前视图
const shot1 = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/Users/liuweijia/.gemini/antigravity/brain/73a7158f-3de0-424c-892b-f40a7b98589d/v33_main_with_share_actions.png", Buffer.from(shot1.data, "base64"));
console.log("Saved: v33_main_with_share_actions.png");

// 4. 模拟切换/新建空间 1024
const switchCheck = await send("Runtime.evaluate", {
  expression: `(async () => {
    const root = document.getElementById("team-context-fullscreen-page")?.shadowRoot;
    // 打开顶栏面板输入 1024 并切换
    root.getElementById("room-status-pill")?.click();
    const input = root.getElementById("popover-new-room");
    input.value = "1024";
    root.getElementById("btn-popover-switch-room")?.click();
    
    // 等待 1500ms 同步完成
    await new Promise(r => setTimeout(r, 1800));
    
    const messages = root.getElementById("messages");
    const emptyState = messages.querySelector(".room-empty-state");
    const pillText = root.getElementById("pill-text")?.innerText;
    return {
      pillText,
      hasEmptyState: !!emptyState,
      emptyTitle: emptyState?.querySelector(".empty-title")?.innerText,
      hasShareEmptyBtn: !!emptyState?.querySelector("#btn-share-empty")
    };
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log("Switch to 1024 space result:", switchCheck.result?.value);

const shot2 = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/Users/liuweijia/.gemini/antigravity/brain/73a7158f-3de0-424c-892b-f40a7b98589d/v33_space_1024_empty_guide.png", Buffer.from(shot2.data, "base64"));
console.log("Saved: v33_space_1024_empty_guide.png");

// 5. 点击空状态中的「📤 一键分享当前对话到本空间」，默认完整发送
const shareCheck = await send("Runtime.evaluate", {
  expression: `(async () => {
    const root = document.getElementById("team-context-fullscreen-page")?.shadowRoot;
    const btn = root.getElementById("btn-share-empty") || root.getElementById("share-thread");
    btn?.click();
    await new Promise(r => setTimeout(r, 1200));
    const messageRows = Array.from(root.querySelectorAll(".messages .row")).map(r => r.innerText.replace(/\\s+/g, " ").trim());
    return {
      messageCount: messageRows.length,
      latestMessageSnippet: messageRows[messageRows.length - 1]?.slice(0, 120)
    };
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log("Share current thread to 1024 space result:", shareCheck.result?.value);

const shot3 = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/Users/liuweijia/.gemini/antigravity/brain/73a7158f-3de0-424c-892b-f40a7b98589d/v33_space_1024_shared_success.png", Buffer.from(shot3.data, "base64"));
console.log("Saved: v33_space_1024_shared_success.png");

// 6. Import 只选择团队消息，再插入当前 Codex 对话
const importCheck = await send("Runtime.evaluate", {
  expression: `(async () => {
    const root = document.getElementById("team-context-fullscreen-page")?.shadowRoot;
    root.getElementById("review")?.click();
    await new Promise(r => setTimeout(r, 400));
    const rows = Array.from(root.querySelectorAll("#context-select-list .context-message-option"));
    if (rows.length) {
      rows[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      root.getElementById("context-select-list")?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    }
    const selectedCount = root.getElementById("context-select-count")?.innerText || "";
    root.getElementById("context-select-import")?.click();
    await new Promise(r => setTimeout(r, 1100));
    return { rows: rows.length, selectedCount };
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log("Import selected team context result:", importCheck.result?.value);

// 7. 切换回 Media 空间
await send("Runtime.evaluate", {
  expression: `(async () => {
    const root = document.getElementById("team-context-fullscreen-page")?.shadowRoot;
    root.getElementById("room-status-pill")?.click();
    const input = root.getElementById("popover-new-room");
    input.value = "Media";
    root.getElementById("btn-popover-switch-room")?.click();
    await new Promise(r => setTimeout(r, 1800));
  })()`,
  awaitPromise: true,
});

ws.close();
