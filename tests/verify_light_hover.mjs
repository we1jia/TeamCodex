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

  // 1. 切换为浅色模式
  console.log("Switching to light theme...");
  await evalCode(`(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    window.__teamContextInstall?.();
  })()`);

  await new Promise(r => setTimeout(r, 200));

  // 2. 模拟鼠标 hover 到 Team 按钮展开
  const teamPos = await evalCode(`(() => {
    const btn = document.querySelector("#team-context-sidebar-tab button");
    const r = btn?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  })()`);

  const pos = teamPos?.result?.value;
  if (!pos) {
    console.error("Team button not found!");
    ws.close();
    return;
  }

  // 移出再移入
  await sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await new Promise(r => setTimeout(r, 100));
  await sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(pos.x), y: Math.round(pos.y) });
  await new Promise(r => setTimeout(r, 250));

  // 3. 检查浅色模式下的菜单项 hover 高亮
  const secondItemCenter = await evalCode(`(() => {
    const items = document.querySelectorAll("#team-context-dropdown-menu .team-menu-item");
    const r = items[1]?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  })()`);

  const itemPos = secondItemCenter?.result?.value;
  if (itemPos) {
    console.log("Hovering second item in light mode at:", itemPos);
    await sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(itemPos.x), y: Math.round(itemPos.y) });
    await new Promise(r => setTimeout(r, 150));

    const lightHoverStyle = await evalCode(`(() => {
      const items = document.querySelectorAll("#team-context-dropdown-menu .team-menu-item");
      const it = items[1];
      const cs = window.getComputedStyle(it);
      return {
        action: it.getAttribute("data-action"),
        bg: cs.backgroundColor,
        color: cs.color,
        cursor: cs.cursor,
        isMatchesHover: it.matches(":hover")
      };
    })()`);
    console.log("Light mode hover result:", JSON.stringify(lightHoverStyle?.result?.value, null, 2));

    // 截图保存
    const screenshot = await sendCommand("Page.captureScreenshot", { format: "png" });
    if (screenshot?.data) {
      fs.writeFileSync("/Users/liuweijia/Desktop/Media/team-context/data/evidence_light_hover_highlight.png", Buffer.from(screenshot.data, "base64"));
      console.log("Screenshot saved to team-context/data/evidence_light_hover_highlight.png");
    }
  }

  // 恢复深色模式（因为用户默认是深色）
  console.log("Restoring dark theme...");
  await evalCode(`(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
    window.__teamContextInstall?.();
  })()`);

  ws.close();
}
main();
