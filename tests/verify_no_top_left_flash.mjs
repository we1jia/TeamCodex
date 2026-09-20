import fs from "fs";

async function main() {
  const ws = new WebSocket("ws://127.0.0.1:63434/devtools/page/92E32D27806D71A91CB031C7573E0324");
  await new Promise(r => ws.onopen = r);
  
  function evalCode(expr) {
    return new Promise((resolve) => {
      const id = Math.floor(Math.random() * 100000);
      const handler = (e) => {
        const data = JSON.parse(e.data);
        if (data.id === id) {
          ws.removeEventListener("message", handler);
          resolve(data.result);
        }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression: expr, returnByValue: true, awaitPromise: true }
      }));
    });
  }

  function sendCommand(method, params) {
    return new Promise((resolve) => {
      const id = Math.floor(Math.random() * 100000);
      const handler = (e) => {
        const data = JSON.parse(e.data);
        if (data.id === id) {
          ws.removeEventListener("message", handler);
          resolve(data.result);
        }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // 1. 注入最新 sidebar_fullscreen.js
  const jsContent = fs.readFileSync("/Users/liuweijia/Desktop/Media/team-context/inject/sidebar_fullscreen.js", "utf-8");
  console.log("Injecting updated sidebar_fullscreen.js...");
  await evalCode(jsContent + "\n; window.__teamContextInstall?.(); 'injected-ok';");
  await new Promise(r => setTimeout(r, 200));

  // 2. 测试场景 A：普通会话页面下的 Hover 定位
  console.log("Testing Scenario A: Normal conversation page...");
  const posA = await evalCode(`(() => {
    const btn = document.querySelector("#team-context-sidebar-tab button");
    const r = btn?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  })()`);

  if (posA?.result?.value) {
    const pt = posA.result.value;
    await sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    await new Promise(r => setTimeout(r, 100));
    await sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(pt.x), y: Math.round(pt.y) });
    await new Promise(r => setTimeout(r, 200));

    const checkA = await evalCode(`(() => {
      const menu = document.getElementById("team-context-dropdown-menu");
      if (!menu) return { found: false };
      const r = menu.getBoundingClientRect();
      const cs = window.getComputedStyle(menu);
      return {
        found: true,
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        transform: cs.transform,
        isInTopLeft: r.left < 50 && r.top < 50
      };
    })()`);
    console.log("Scenario A check:", checkA?.result?.value);
  }

  // 3. 测试场景 B：Team 全屏协作页面下的 Hover 定位 (用户截图的真实复现环境)
  console.log("Testing Scenario B: Fullscreen page active...");
  await evalCode(`(() => {
    window.__teamContextOpenPage?.();
  })()`);
  await new Promise(r => setTimeout(r, 300));

  const posB = await evalCode(`(() => {
    const btn = document.querySelector("#team-context-sidebar-tab button");
    const r = btn?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  })()`);

  if (posB?.result?.value) {
    const pt = posB.result.value;
    await sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    await new Promise(r => setTimeout(r, 100));
    await sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(pt.x), y: Math.round(pt.y) });
    await new Promise(r => setTimeout(r, 200));

    const checkB = await evalCode(`(() => {
      const menu = document.getElementById("team-context-dropdown-menu");
      if (!menu) return { found: false };
      const r = menu.getBoundingClientRect();
      const cs = window.getComputedStyle(menu);
      return {
        found: true,
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        transform: cs.transform,
        isInTopLeft: r.left < 50 && r.top < 50
      };
    })()`);
    console.log("Scenario B (fullscreen) check:", checkB?.result?.value);

    // 截屏保存
    const screenshot = await sendCommand("Page.captureScreenshot", { format: "png" });
    if (screenshot?.data) {
      fs.writeFileSync("/Users/liuweijia/Desktop/Media/team-context/data/evidence_fullscreen_hover.png", Buffer.from(screenshot.data, "base64"));
      console.log("Saved evidence_fullscreen_hover.png");
    }
  }

  ws.close();
}
main();
