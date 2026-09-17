delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.ALL_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.all_proxy;
delete process.env.NO_PROXY;

import http from "node:http";

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: new http.Agent() }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
  });
}

function connect(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", (e) => reject(new Error("ws err")), { once: true });
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
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;

  const res = await client.evaluate(`(async () => {
    const report = {};
    const page = document.getElementById("team-context-fullscreen-page");
    const shadow = page?.shadowRoot;
    report.pagePresent = !!page;
    report.shadowPresent = !!shadow;

    // 1. 检查 bridge iframe 状态
    const ifr = document.getElementById("__team_context_bridge_frame__");
    report.bridgeIframe = {
      present: !!ifr,
      contentWindow: !!ifr?.contentWindow,
      fetchType: typeof ifr?.contentWindow?.fetch,
      esType: typeof ifr?.contentWindow?.EventSource,
    };

    // 2. 检查全局 window.__teamContextHost
    report.hostUrl = window.__TEAM_CONTEXT_HOST__;

    // 3. 测试从 bridgeWindow 发起 fetch (带 2000ms 超时)
    const testBridgeFetch = async () => {
      if (!ifr?.contentWindow?.fetch) return { error: "no-bridge-fetch" };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        const r = await ifr.contentWindow.fetch("http://127.0.0.1:18765/api/snapshot", {
          signal: controller.signal,
        });
        clearTimeout(timer);
        return { ok: true, status: r.status };
      } catch (e) {
        clearTimeout(timer);
        return { ok: false, error: e.name + ": " + e.message };
      }
    };
    report.bridgeFetchTest = await testBridgeFetch();

    // 4. 测试页面顶层 fetch (带 2000ms 超时)
    const testTopFetch = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        const r = await fetch("http://127.0.0.1:18765/api/snapshot", {
          signal: controller.signal,
        });
        clearTimeout(timer);
        return { ok: true, status: r.status };
      } catch (e) {
        clearTimeout(timer);
        return { ok: false, error: e.name + ": " + e.message };
      }
    };
    report.topFetchTest = await testTopFetch();

    // 5. 检查当前的 connState 与 pill 文本
    const pillText = shadow?.getElementById("pill-text")?.textContent;
    const btnConnectText = shadow?.getElementById("btn-connect-text")?.textContent;
    const btnDisabled = shadow?.getElementById("btn-confirm-connect")?.disabled;
    report.ui = { pillText, btnConnectText, btnDisabled };

    return report;
  })()`);

  console.log("DIAG REPORT:\n", JSON.stringify(res, null, 2));
  client.close();
}

main().catch(console.error);
