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

function connect(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("cdp websocket error")), { once: true });
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data.toString());
    if (message.id == null || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || "cdp error"));
    else resolve(message.result);
  });
  return {
    ws,
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression) {
      const res = await this.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return res.result?.value;
    },
    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}

async function main() {
  const targets = await getJson("http://127.0.0.1:18766/json/list");
  const target = targets.find((t) => t.type === "page" && t.url.includes("app"));
  if (!target) {
    console.error("No target found");
    process.exit(1);
  }

  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;

  // 检查控制台与运行状态
  const state = await client.evaluate(`(() => {
    const page = document.getElementById("team-context-fullscreen-page");
    const shadow = page?.shadowRoot;
    const modal = shadow?.getElementById("connect-modal");
    const banner = shadow?.getElementById("connect-error-banner");
    const btn = shadow?.getElementById("btn-confirm-connect");
    const btnText = shadow?.getElementById("btn-connect-text")?.textContent;

    // 尝试在页面直接测试 fetch http://127.0.0.1:18765/api/rooms/verify
    let testFetchError = null;
    let testFetchStatus = null;

    return {
      modalHidden: modal?.hidden,
      bannerText: banner?.textContent,
      bannerHidden: banner?.hidden,
      btnDisabled: btn?.disabled,
      btnText,
      storageConfig: localStorage.getItem("team_context_config_v2"),
    };
  })()`);

  console.log("Current Page & Modal State:", state);

  // 尝试在页面内执行一次直接 fetch 并看报错
  const fetchTest = await client.evaluate(`(async () => {
    try {
      const res = await fetch("http://127.0.0.1:18765/api/rooms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: "Media", room_key: "", auto_create: true }),
      });
      return { ok: true, status: res.status, data: await res.json() };
    } catch (err) {
      return { ok: false, errorName: err.name, errorMsg: err.message, stack: err.stack };
    }
  })()`);

  console.log("Direct Fetch Test in Codex Page:", fetchTest);

  // 尝试用 bridgeWindow fetch 测试
  const bridgeTest = await client.evaluate(`(async () => {
    try {
      const ifr = document.getElementById("__team_context_bridge_frame__");
      if (!ifr || !ifr.contentWindow) return { error: "no-bridge-frame" };
      const res = await ifr.contentWindow.fetch("http://127.0.0.1:18765/api/rooms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: "Media", room_key: "", auto_create: true }),
      });
      return { ok: true, status: res.status, data: await res.json() };
    } catch (err) {
      return { ok: false, errorName: err.name, errorMsg: err.message, stack: err.stack };
    }
  })()`);

  console.log("Bridge Window Fetch Test in Codex Page:", bridgeTest);

  // 测试 EventSource (SSE)
  const sseTest = await client.evaluate(`(async () => {
    return new Promise((resolve) => {
      try {
        const es = new EventSource("http://127.0.0.1:18765/api/events?room=Media");
        es.onopen = () => { es.close(); resolve({ ok: true, stage: "open" }); };
        es.onerror = (e) => { es.close(); resolve({ ok: false, readyState: es.readyState }); };
        setTimeout(() => { es.close(); resolve({ ok: false, timeout: true }); }, 2000);
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });
  })()`);

  console.log("SSE Test in Codex Page:", sseTest);

  client.close();
}

main().catch(console.error);
