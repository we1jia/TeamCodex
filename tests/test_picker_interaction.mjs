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

  const ensureOpen = async () => {
    await client.evaluate(`(() => {
      const page = document.getElementById("team-context-fullscreen-page");
      if (!page) {
        document.getElementById("team-context-sidebar-tab")?.querySelector("button")?.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));
  };

  await ensureOpen();

  // 测试 1: 点击对话项关联对话
  const testPickThread = await client.evaluate(`(() => {
    const page = document.getElementById("team-context-fullscreen-page");
    const shadow = page?.shadowRoot;
    const mentionBtn = shadow?.getElementById("mention");
    const picker = shadow?.getElementById("picker");
    const linkRow = shadow?.getElementById("link-row");

    if (picker.hidden) mentionBtn.click();
    const firstThreadBtn = picker.querySelector(".picker-section .picker-item");
    if (!firstThreadBtn) return { error: "no-thread-item" };

    const title = firstThreadBtn.querySelector(".picker-item-title")?.textContent;
    firstThreadBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    return {
      title,
      pickerHidden: picker.hidden,
      linkRowText: linkRow.textContent,
    };
  })()`);
  console.log("1. 选对话关联测试:", testPickThread);

  // 测试 2: 点击成员插入 @
  await ensureOpen();
  const testPickPerson = await client.evaluate(`(() => {
    const page = document.getElementById("team-context-fullscreen-page");
    const shadow = page?.shadowRoot;
    const mentionBtn = shadow?.getElementById("mention");
    const picker = shadow?.getElementById("picker");
    const input = shadow?.getElementById("input");

    if (picker.hidden) mentionBtn.click();
    const sections = [...picker.querySelectorAll(".picker-section")];
    const memberSection = sections.find(s => s.querySelector(".picker-group-title")?.textContent?.includes("团队成员"));
    const firstPersonBtn = memberSection?.querySelector(".picker-item");
    if (!firstPersonBtn) return { error: "no-person-item" };

    firstPersonBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    return {
      inputValue: input.value,
      pickerHidden: picker.hidden,
    };
  })()`);
  console.log("2. 选成员 @提及测试:", testPickPerson);

  // 测试 3: 点击外部收起
  await ensureOpen();
  const testClickOutside = await client.evaluate(`(() => {
    const page = document.getElementById("team-context-fullscreen-page");
    const shadow = page?.shadowRoot;
    const mentionBtn = shadow?.getElementById("mention");
    const picker = shadow?.getElementById("picker");
    const messages = shadow?.getElementById("messages");

    if (picker.hidden) mentionBtn.click();
    const opened = !picker.hidden;

    messages.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    return {
      opened,
      closedAfterClickOutside: picker.hidden,
    };
  })()`);
  console.log("3. 点击外部区域自动收起测试:", testClickOutside);

  // 测试 4: 全局 Esc 优先收起 picker
  await ensureOpen();
  const testEsc = await client.evaluate(`(() => {
    const page = document.getElementById("team-context-fullscreen-page");
    const shadow = page?.shadowRoot;
    const mentionBtn = shadow?.getElementById("mention");
    const picker = shadow?.getElementById("picker");

    if (picker.hidden) mentionBtn.click();
    const opened = !picker.hidden;

    // 触发全局 Esc 事件 (从 document 派发)
    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(escEvent);

    return {
      opened,
      closedAfterEsc: picker.hidden,
      pageStillPresent: !!document.getElementById("team-context-fullscreen-page"),
    };
  })()`);
  console.log("4. 全局 Esc 优先收起 picker 测试:", testEsc);

  client.close();
}

main().catch(console.error);
