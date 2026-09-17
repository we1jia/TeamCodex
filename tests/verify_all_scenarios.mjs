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
const target = targets.find((t) => t.type === "page" && (t.url.startsWith("app://") || /Codex/i.test(t.title)) && !t.url.includes("avatar-overlay") && !t.url.includes("detached-window"));

if (!target) {
  console.error("Target not found!");
  process.exit(1);
}

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

await send("Page.enable");
await send("Runtime.enable");

async function dispatchRealClick(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function getTabButtonCoords() {
  const res = await send("Runtime.evaluate", {
    expression: `(() => {
      const btn = document.querySelector("#team-context-sidebar-tab button");
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, active: btn.getAttribute("data-active") };
    })()`,
    returnByValue: true,
  });
  return res.result.value;
}

async function getWorkspaceState() {
  const res = await send("Runtime.evaluate", {
    expression: `(() => {
      const page = document.getElementById("team-context-fullscreen-page");
      const tab = document.getElementById("team-context-sidebar-tab");
      const btn = tab?.querySelector("button");
      const shadow = page?.shadowRoot;
      const title = shadow?.querySelector("h1, .room-name, header, .header-title")?.textContent?.trim();
      const pill = shadow?.getElementById("room-status-pill")?.textContent?.trim();
      return {
        hasPage: !!page,
        pageDisplay: page?.style.display,
        tabActive: btn?.getAttribute("data-active"),
        title,
        pill,
        dataUi: tab?.dataset?.ui,
      };
    })()`,
    returnByValue: true,
  });
  return res.result.value;
}

console.log("=== Scenario 1: Initial state check & real mouse click to enter collaboration ===");
await send("Runtime.evaluate", { expression: "window.__teamContextClosePage()" });
await new Promise((r) => setTimeout(r, 300));

let tabCoords = await getTabButtonCoords();
console.log("Tab button coordinates:", tabCoords);
if (!tabCoords) {
  console.error("Scenario 1 FAILED: #team-context-sidebar-tab button not found!");
  process.exit(1);
}

// Click Tab using REAL mouse events
await dispatchRealClick(tabCoords.x, tabCoords.y);
await new Promise((r) => setTimeout(r, 400));

const state1 = await getWorkspaceState();
console.log("Scenario 1 - Collaboration opened via real mouse click:", state1);

if (!state1.hasPage || state1.tabActive !== "true") {
  console.error("Scenario 1 FAILED: Could not open collaboration page via mouse click!");
  process.exit(1);
}

console.log("=== Scenario 2: Test Esc key to return to conversation ===");
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 27, key: "Escape" });
await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 27, key: "Escape" });
await new Promise((r) => setTimeout(r, 300));

const state2 = await getWorkspaceState();
console.log("Scenario 2 - After Esc key:", state2);

if (state2.hasPage) {
  console.error("Scenario 2 FAILED: Page did not close on Esc!");
  process.exit(1);
}

console.log("=== Scenario 3: Switch conversation in sidebar, then click Tab to switch BACK ===");
// Select another conversation in Codex sidebar
const switchRes = await send("Runtime.evaluate", {
  expression: `(() => {
    const threads = Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-id]"));
    const other = threads.find(t => t.getAttribute("data-app-action-sidebar-thread-active") !== "true") || threads[0];
    if (other) {
      other.click();
      return { clicked: true, title: other.textContent.slice(0, 30) };
    }
    return { clicked: false };
  })()`,
  returnByValue: true,
});
console.log("Switched to conversation:", switchRes.result.value);
await new Promise((r) => setTimeout(r, 600));

// Verify still in conversation mode
const stateBeforeSwitchBack = await getWorkspaceState();
console.log("State before switching back:", stateBeforeSwitchBack);

// Now click Tab with REAL mouse events to switch BACK to collaboration
tabCoords = await getTabButtonCoords();
await dispatchRealClick(tabCoords.x, tabCoords.y);
await new Promise((r) => setTimeout(r, 400));

const state3 = await getWorkspaceState();
console.log("Scenario 3 - Switched BACK to collaboration:", state3);

if (!state3.hasPage || state3.tabActive !== "true") {
  console.error("Scenario 3 FAILED: Could not switch back to collaboration after thread switch!");
  process.exit(1);
}

console.log("=== Scenario 4: Fast double-click debounce protection ===");
// Rapidly click Tab twice in 50ms
tabCoords = await getTabButtonCoords();
await dispatchRealClick(tabCoords.x, tabCoords.y);
await new Promise((r) => setTimeout(r, 50));
await dispatchRealClick(tabCoords.x, tabCoords.y);
await new Promise((r) => setTimeout(r, 300));

const state4 = await getWorkspaceState();
console.log("Scenario 4 - After fast double click:", state4);

if (!state4.hasPage) {
  console.error("Scenario 4 FAILED: Fast double-click caused accidental closure!");
  process.exit(1);
}

console.log("=== Scenario 5: Deliberate toggle to conversation and toggle back ===");
// Wait past debounce window (500ms)
await new Promise((r) => setTimeout(r, 500));
tabCoords = await getTabButtonCoords();
await dispatchRealClick(tabCoords.x, tabCoords.y);
await new Promise((r) => setTimeout(r, 400));

const state5Closed = await getWorkspaceState();
console.log("Scenario 5 - Toggled to close:", state5Closed);
if (state5Closed.hasPage) {
  console.error("Scenario 5 FAILED: Deliberate click did not close page!");
  process.exit(1);
}

// Click again to reopen
tabCoords = await getTabButtonCoords();
await dispatchRealClick(tabCoords.x, tabCoords.y);
await new Promise((r) => setTimeout(r, 500));

const state5Reopened = await getWorkspaceState();
console.log("Scenario 5 - Reopened collaboration:", state5Reopened);
if (!state5Reopened.hasPage || state5Reopened.tabActive !== "true") {
  console.error("Scenario 5 FAILED: Could not reopen collaboration page!");
  process.exit(1);
}

console.log("=== Scenario 6: Capture high-fidelity screenshot evidence ===");
const shot = await send("Page.captureScreenshot", { format: "png" });
const shotPath = "/Users/liuweijia/Desktop/Media/team-context/data/evidence_collab_active.png";
fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
console.log("Saved screenshot evidence to:", shotPath);

ws.close();
console.log("ALL 6 SCENARIOS FULLY PASSED WITH DEEP VERIFICATION!");
