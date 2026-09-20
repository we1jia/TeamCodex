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

  // 1. 重新注入执行 sidebar_fullscreen.js
  const jsContent = fs.readFileSync("/Users/liuweijia/Desktop/Media/team-context/inject/sidebar_fullscreen.js", "utf-8");
  console.log("Injecting updated sidebar_fullscreen.js...");
  const injectRes = await evalCode(jsContent + "\n; window.__teamContextInstall?.(); 'injected-ok';");
  console.log("Inject result:", injectRes);

  await new Promise(r => setTimeout(r, 300));

  // 2. 获取 Team 按钮的坐标
  const teamPos = await evalCode(`(() => {
    const wrapper = document.getElementById("team-context-sidebar-tab");
    const btn = wrapper?.querySelector("button");
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
  })()`);
  console.log("Team button pos:", teamPos?.result?.value);
  const pos = teamPos?.result?.value;
  if (!pos) {
    console.error("Team button not found!");
    ws.close();
    return;
  }

  // 3. 测试【hover显示】：先将鼠标移到远处 (0, 0)，然后再 hover 到 Team 按钮
  console.log("Moving mouse to (0, 0)...");
  await sendCommand("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 0,
    y: 0
  });
  await new Promise(r => setTimeout(r, 100));

  console.log("Simulating mouse hover into Team button at:", pos);
  await sendCommand("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(pos.x),
    y: Math.round(pos.y)
  });

  // 等待 250ms (包含 60ms delay) 检查菜单是否自动展开
  await new Promise(r => setTimeout(r, 250));

  const menuOpenCheck = await evalCode(`(() => {
    const menu = document.getElementById("team-context-dropdown-menu");
    const btn = document.querySelector("#team-context-sidebar-tab button");
    return {
      menuOpen: !!menu,
      btnState: btn?.getAttribute("data-state"),
      btnExpanded: btn?.getAttribute("aria-expanded"),
      lastCloseReason: window.__lastCloseReason,
      lastOpenDebug: window.__lastOpenDebug
    };
  })()`);
  console.log("Hover auto-open check:", JSON.stringify(menuOpenCheck?.result?.value, null, 2));

  // 4. 测试【hover高亮】：获取展开的菜单各项位置，模拟鼠标分别悬停
  const itemsCheck = await evalCode(`(() => {
    const menu = document.getElementById("team-context-dropdown-menu");
    if (!menu) return null;
    const items = Array.from(menu.querySelectorAll(".team-menu-item"));
    return items.map(it => {
      const r = it.getBoundingClientRect();
      const cs = window.getComputedStyle(it);
      return {
        action: it.getAttribute("data-action"),
        text: it.textContent.replace(/\\s+/g, " ").trim(),
        rect: { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height },
        defaultBg: cs.backgroundColor,
        cursor: cs.cursor
      };
    });
  })()`);
  console.log("Menu items before hover:", itemsCheck?.result?.value);

  const items = itemsCheck?.result?.value || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    console.log(`Hovering item ${i} (${it.action}: ${it.text})...`);
    await sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.round(it.rect.x),
      y: Math.round(it.rect.y)
    });
    await new Promise(r => setTimeout(r, 150));

    const itemHovered = await evalCode(`(() => {
      const its = document.querySelectorAll("#team-context-dropdown-menu .team-menu-item");
      const current = its[${i}];
      if (!current) return null;
      const cs = window.getComputedStyle(current);
      const svg = current.querySelector("svg");
      const svgCs = svg ? window.getComputedStyle(svg) : null;
      return {
        action: current.getAttribute("data-action"),
        highlighted: current.getAttribute("data-highlighted"),
        bg: cs.backgroundColor,
        color: cs.color,
        cursor: cs.cursor,
        svgOpacity: svgCs?.opacity,
        isMatchesHover: current.matches(":hover")
      };
    })()`);
    console.log(`Item ${i} hover result:`, itemHovered?.result?.value);
  }

  // 5. 截取当前 Hover 状态下的屏幕快照
  const screenshot = await sendCommand("Page.captureScreenshot", { format: "png" });
  if (screenshot?.data) {
    fs.writeFileSync("/Users/liuweijia/Desktop/Media/team-context/data/evidence_hover_highlight.png", Buffer.from(screenshot.data, "base64"));
    console.log("Screenshot saved to team-context/data/evidence_hover_highlight.png");
  }

  // 6. 测试【移开侧栏其他按钮自动关闭】
  console.log("Testing leave to other sidebar buttons...");
  const otherPos = await evalCode(`(() => {
    const explore = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("探索"));
    if (!explore) return null;
    const r = explore.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);

  if (otherPos?.result?.value) {
    await sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.round(otherPos.result.value.x),
      y: Math.round(otherPos.result.value.y)
    });
    // scheduleCloseTeamMenu 延迟为 220ms，等待 300ms 验证关闭
    await new Promise(r => setTimeout(r, 300));

    const closedCheck = await evalCode(`(() => {
      return {
        menuStillExists: !!document.getElementById("team-context-dropdown-menu"),
        btnState: document.querySelector("#team-context-sidebar-tab button")?.getAttribute("data-state")
      };
    })()`);
    console.log("After moving to Explore and waiting 300ms, closed check:", closedCheck?.result?.value);
  }

  ws.close();
}
main();
