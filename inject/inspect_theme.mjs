import http from "node:http";

async function main() {
  const versionInfo = await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:18766/json", res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });

  const pageTarget = versionInfo.find(t => t.type === "page" && !t.url.includes("avatar-overlay") && !t.url.includes("detached-window"));
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = msgId++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await new Promise(r => ws.addEventListener("open", r));

  const expression = `
    (() => {
      const results = {};
      
      // 1. 查找侧边栏中的彩色彩点或图标
      const aside = document.querySelector("aside");
      const colored = [];
      if (aside) {
        const all = aside.querySelectorAll("*");
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          const cs = window.getComputedStyle(el);
          const bg = cs.backgroundColor;
          const color = cs.color;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && !bg.includes("255, 255, 255") && !bg.includes("24, 24, 24") && !bg.includes("0, 0, 0")) {
            colored.push({ tag: el.tagName, class: el.className, bg, color });
          }
        }
      }
      results.asideColored = colored;

      // 2. 原生气泡
      const bubble = document.querySelector("[data-user-message-bubble]") || document.querySelector(".bg-user-message");
      if (bubble) {
        const cs = window.getComputedStyle(bubble);
        results.bubble = {
          bg: cs.backgroundColor,
          color: cs.color,
          border: cs.border,
          borderRadius: cs.borderRadius
        };
      }

      // 3. 原生 Composer
      const composer = document.querySelector("form");
      if (composer) {
        const cs = window.getComputedStyle(composer);
        results.composer = {
          bg: cs.backgroundColor,
          border: cs.border,
          boxShadow: cs.boxShadow,
          borderRadius: cs.borderRadius
        };
        const buttons = Array.from(composer.querySelectorAll("button")).map(b => {
          const bcs = window.getComputedStyle(b);
          return {
            aria: b.getAttribute("aria-label"),
            bg: bcs.backgroundColor,
            color: bcs.color,
            class: b.className
          };
        });
        results.composerButtons = buttons;
      }

      // 4. 宿主主题
      results.dataTheme = document.documentElement.getAttribute("data-theme");

      return results;
    })()
  `;

  const evalRes = await send("Runtime.evaluate", {
    expression,
    returnByValue: true
  });

  console.log("INSPECTION:", JSON.stringify(evalRes, null, 2));
  ws.close();
}

main().catch(console.error);
