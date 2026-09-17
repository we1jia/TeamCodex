import http from "node:http";

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

const res = await send("Runtime.evaluate", {
  expression: `(() => {
    // 寻找当前激活的对话
    const activeItem = document.querySelector("[data-app-action-sidebar-thread-selected='true']");
    const activeTitle = activeItem ? (activeItem.getAttribute("data-app-action-sidebar-thread-title") || activeItem.getAttribute("aria-label") || activeItem.innerText).trim() : document.title;
    
    // 寻找主会话区域中的消息
    const bubbles = Array.from(document.querySelectorAll("[data-message-author-role], [data-user-message-bubble], .bg-user-message, article"));
    const samples = bubbles.slice(-4).map(b => ({
      role: b.getAttribute("data-message-author-role") || (b.className.includes("user") ? "user" : "assistant"),
      text: (b.innerText || "").trim().slice(0, 100)
    }));

    return {
      activeTitle,
      bubbleCount: bubbles.length,
      samples
    };
  })()`,
  returnByValue: true,
});

console.log("Chat DOM probe:", JSON.stringify(res.result?.value, null, 2));
ws.close();
