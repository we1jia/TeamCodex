#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEAM_CODEX_LAUNCHER_PORT || 18767);
const PANEL_FILE = path.join(ROOT, "ui", "panel.html");
const DATA_DIR = process.env.TEAM_CONTEXT_DATA_DIR || path.join(ROOT, "data");
const CONFIG_FILE = path.join(DATA_DIR, "launcher.json");
const DISCOVERY_FILE = path.join(DATA_DIR, "hub_discovery.json");
const VERSION_FILE = path.join(ROOT, "version.json");
const LOG_FILE = path.join(DATA_DIR, "launcher.log");
const GITHUB_REPO = process.env.TEAM_CODEX_RELEASES_REPO || "we1jia/TeamCodex";

fs.mkdirSync(DATA_DIR, { recursive: true });

function nowIso() {
  return new Date().toISOString();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function appVersion() {
  const v = readJson(VERSION_FILE, {});
  return String(v.version || "1.1.3");
}

function loadConfig() {
  const discovery = readJson(DISCOVERY_FILE, {});
  const saved = readJson(CONFIG_FILE, {});
  const room = saved.room || discovery.default_room || "1024";
  const roomKey =
    saved.room_key ||
    discovery.rooms?.[room]?.key ||
    discovery.known_keys?.[room] ||
    "123456";
  return {
    hub_url: String(saved.hub_url || process.env.TEAM_CONTEXT_HOST || discovery.hub_url || "http://127.0.0.1:18765").replace(/\/$/, ""),
    room: String(room),
    room_key: String(roomKey || ""),
  };
}

function saveConfig(partial) {
  const next = { ...loadConfig(), ...partial, updated_at: nowIso() };
  writeJson(CONFIG_FILE, next);
  const discovery = readJson(DISCOVERY_FILE, {});
  discovery.hub_url = next.hub_url;
  discovery.default_room = next.room;
  discovery.rooms = discovery.rooms || {};
  discovery.rooms[next.room] = { ...(discovery.rooms[next.room] || {}), key: next.room_key };
  discovery.known_keys = discovery.known_keys || {};
  discovery.known_keys[next.room] = next.room_key;
  discovery.updated_at = nowIso();
  writeJson(DISCOVERY_FILE, discovery);
  return next;
}

function requestJson(url, timeout = 2500) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.get(parsed, { timeout, headers: { "User-Agent": "TeamCodex-Launcher" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(body || "{}") });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function parseVersion(raw) {
  return String(raw || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

let updateCache = { at: 0, value: null };

async function checkUpdate({ force = false } = {}) {
  const current = appVersion();
  if (!force && updateCache.value && Date.now() - updateCache.at < 5 * 60 * 1000) {
    return { ...updateCache.value, current };
  }
  const empty = {
    current,
    latest: current,
    has_update: false,
    url: `https://github.com/${GITHUB_REPO}/releases/latest`,
    notes: "",
    asset: null,
  };
  try {
    const { status, body } = await requestJson(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      6000,
    );
    if (status !== 200 || !body?.tag_name) {
      return { ...empty, check_failed: true, message: `GitHub API 响应异常 (${status || "无响应"})` };
    }
    const latest = String(body.tag_name).replace(/^v/i, "");
    const want = process.platform === "darwin" ? "TeamCodex-macOS.dmg" : "TeamCodex-Setup.exe";
    const asset = (body.assets || []).find((item) => item.name === want) || null;
    const value = {
      current,
      latest,
      has_update: isNewer(latest, current),
      url: body.html_url || empty.url,
      notes: String(body.body || "").slice(0, 800),
      asset: asset
        ? { name: asset.name, url: asset.browser_download_url, size: asset.size }
        : null,
    };
    updateCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    return { ...empty, check_failed: true, message: "无法连接 GitHub Releases (网络连接超时)" };
  }
}

function isAttachRunning() {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*attach_codex.mjs*' } | Select-Object -ExpandProperty ProcessId",
        ],
        { encoding: "utf8", timeout: 4000 },
      );
      return Boolean(out.trim());
    }
    execFileSync("pgrep", ["-f", "inject/attach_codex.mjs"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function stopAttach() {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*attach_codex.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync("pkill -f inject/attach_codex.mjs || true", { stdio: "ignore" });
    }
  } catch {}
}

function startAttach() {
  const cfg = loadConfig();
  stopAttach();
  const attachLogPath = path.join(ROOT, "data", "attach.log");
  let outFd = "ignore";
  try {
    fs.mkdirSync(path.dirname(attachLogPath), { recursive: true });
    outFd = fs.openSync(attachLogPath, "a");
  } catch {}
  const child = spawn(process.execPath, [path.join(ROOT, "inject", "attach_codex.mjs")], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", outFd, outFd],
    env: {
      ...process.env,
      TEAM_CONTEXT_HOST: cfg.hub_url,
      TEAM_CONTEXT_DEFAULT_ROOM: cfg.room,
      TEAM_CONTEXT_DEFAULT_ROOM_KEY: cfg.room_key,
    },
  });
  child.unref();
}

function isCodexRunning() {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", "Get-Process -Name @('ChatGPT', 'Codex') -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"],
        { encoding: "utf8", timeout: 2500 },
      );
      return Boolean(out.trim());
    }
    const out = execFileSync("/bin/ps", ["-ax", "-o", "command="], { encoding: "utf8", timeout: 2500 });
    return out.split("\n").some((line) => /ChatGPT\.app\/Contents\/MacOS\/ChatGPT|Codex/i.test(line));
  } catch {
    return false;
  }
}

function hasCustomProxyConfig() {
  const proxyEnvs = [
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
    "http_proxy", "https_proxy", "all_proxy",
    "OPENAI_API_BASE", "OPENAI_BASE_URL",
  ];
  for (const envKey of proxyEnvs) {
    if (process.env[envKey]) return true;
  }

  const configPaths = [];
  if (process.env.HOME) {
    configPaths.push(path.join(process.env.HOME, ".config", "codex", "config.toml"));
    configPaths.push(path.join(process.env.HOME, "Library", "Application Support", "OpenAI", "ChatGPT", "settings.json"));
  }
  if (process.env.USERPROFILE) {
    configPaths.push(path.join(process.env.USERPROFILE, ".config", "codex", "config.toml"));
  }
  if (process.env.APPDATA) {
    configPaths.push(path.join(process.env.APPDATA, "OpenAI", "ChatGPT", "settings.json"));
  }

  for (const cfgPath of configPaths) {
    try {
      if (fs.existsSync(cfgPath)) {
        const content = fs.readFileSync(cfgPath, "utf8");
        if (/proxy|base_url|api_base|localhost|127\.0\.0\.1|route/i.test(content)) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}

function reapOrphanModifierMonitors() {
  if (process.platform === "darwin") {
    try {
      execSync("ps -ef | grep 'bare-modifier-monitor' | grep -v grep | awk '$3 == 1 {print $2}' | xargs kill -9 2>/dev/null || true");
    } catch {}
  }
}

// 启动后台孤儿扫描，每 15 秒静默回收脱离父进程 (PPID=1) 的全局事件拦截器，彻底根除触控板卡顿
setInterval(reapOrphanModifierMonitors, 15000).unref();

function launchCodex(opts = {}) {
  const force = Boolean(opts.force);
  const port = Number(process.env.TEAM_CONTEXT_CDP_PORT || 18766);
  if (process.platform === "darwin") {
    if (force) {
      try {
        execSync(`osascript -e 'tell application "ChatGPT" to quit' 2>/dev/null || true`);
        const start = Date.now();
        while (Date.now() - start < 3000) {
          try {
            execSync(`/usr/bin/pgrep -f "ChatGPT.app/Contents/MacOS/ChatGPT"`, { stdio: "ignore" });
            execSync(`/bin/sleep 0.3`);
          } catch {
            break;
          }
        }
        execSync(`/usr/bin/pkill -f "ChatGPT.app/Contents/MacOS/ChatGPT" 2>/dev/null || true`);
        execSync(`/usr/bin/pkill -f "bare-modifier-monitor" 2>/dev/null || true`);
        execSync(`/usr/bin/pkill -f "browser_crashpad_handler" 2>/dev/null || true`);
        execSync(`/bin/sleep 0.5`);
      } catch {}
    }
    reapOrphanModifierMonitors();
    spawn("/usr/bin/open", [
      "-n",
      "-a",
      "/Applications/ChatGPT.app",
      "--args",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
    ], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "win32") {
    const runScript = path.join(ROOT, "windows", "run-teamcodex.ps1");
    spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", runScript], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
}

async function hubHealth(hubUrl) {
  try {
    const { status, body } = await requestJson(`${hubUrl.replace(/\/$/, "")}/api/health`, 1500);
    if (status === 200 && body?.ok) return body;
  } catch {}
  if (!hubUrl.includes("127.0.0.1") && !hubUrl.includes("localhost")) {
    try {
      const { status, body } = await requestJson("http://127.0.0.1:18765/api/health", 1000);
      if (status === 200 && body?.ok) {
        saveConfig({ hub_url: "http://127.0.0.1:18765" });
        return body;
      }
    } catch {}
  }
  return null;
}

function findActiveCdpPort() {
  const defaultPort = Number(process.env.TEAM_CONTEXT_CDP_PORT || 18766);
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name like '%ChatGPT%' or Name like '%Codex%'\" | Select-Object -ExpandProperty CommandLine"],
        { encoding: "utf8", timeout: 2500 },
      );
      const m = out.match(/--remote-debugging-port=(\d+)/);
      if (m) return Number(m[1]);
    } else {
      const out = execFileSync("/bin/ps", ["-ax", "-o", "command="], { encoding: "utf8", timeout: 2500 });
      for (const line of out.split("\n")) {
        if (/ChatGPT|Codex/i.test(line)) {
          const m = line.match(/--remote-debugging-port=(\d+)/);
          if (m) return Number(m[1]);
        }
      }
    }
  } catch {}
  return defaultPort;
}

async function cdpReady() {
  const detectedPort = findActiveCdpPort();
  const defaultPort = Number(process.env.TEAM_CONTEXT_CDP_PORT || 18766);
  const portsToTry = Array.from(new Set([detectedPort, defaultPort]));
  for (const p of portsToTry) {
    try {
      const { status } = await requestJson(`http://127.0.0.1:${p}/json/version`, 800);
      if (status === 200) return true;
    } catch {}
  }
  return false;
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...cors(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function openUpdate(update) {
  const target = update.asset?.url || update.url;
  if (!target) throw new Error("没有可打开的更新地址");
  if (process.platform === "darwin") {
    spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
  }
  return target;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors());
    res.end();
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/panel.html")) {
    fs.readFile(PANEL_FILE, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("panel not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    const cfg = loadConfig();
    const [hub, codex, update] = await Promise.all([hubHealth(cfg.hub_url), cdpReady(), checkUpdate()]);
    sendJson(res, 200, {
      ok: true,
      app_version: appVersion(),
      hub: {
        ok: Boolean(hub),
        url: cfg.hub_url,
        version: hub?.version || "",
        lanUrl: hub?.lanUrl || cfg.hub_url,
      },
      codex: {
        running: codex,
        injected: codex && isAttachRunning(),
      },
      room: { id: cfg.room, key_set: Boolean(cfg.room_key) },
      update,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/token") {
    const cfg = loadConfig();
    const hub = await hubHealth(cfg.hub_url);
    const hubUrl = hub?.lanUrl || cfg.hub_url;
    const token = `Hub: ${hubUrl} | Room: ${cfg.room} | Key: ${cfg.room_key || ""}`;
    sendJson(res, 200, { ok: true, token, hub_url: hubUrl, room: cfg.room });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/update") {
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    sendJson(res, 200, await checkUpdate({ force }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hub") {
    let body = {};
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, error: "invalid json" });
    }
    const hubUrl = String(body.hub_url || "").trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(hubUrl)) {
      return sendJson(res, 400, { ok: false, error: "invalid_hub_url", message: "中枢地址需要 http 或 https" });
    }
    const cfg = saveConfig({
      hub_url: hubUrl,
      room: body.room ? String(body.room) : undefined,
      room_key: body.room_key != null ? String(body.room_key) : undefined,
    });
    startAttach();
    sendJson(res, 200, { ok: true, ...cfg });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/restart-inject") {
    startAttach();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/start-codex") {
    let body = {};
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {}

    const ready = await cdpReady();
    if (ready) {
      startAttach();
      sendJson(res, 200, {
        ok: true,
        mode: "attached",
        message: "检测到 Codex 调试通道已就绪，已直接热挂载，未中断现有会话",
      });
      return;
    }

    const running = isCodexRunning();
    if (!running) {
      launchCodex({ force: false });
      setTimeout(() => {
        startAttach();
      }, 1200);
      sendJson(res, 200, {
        ok: true,
        mode: "launched",
        message: "已拉起 Codex 客户端并正在挂载",
      });
      return;
    }

    if (body.force) {
      launchCodex({ force: true });
      setTimeout(() => {
        startAttach();
      }, 1500);
      sendJson(res, 200, {
        ok: true,
        mode: "restarted",
        message: "已重启 Codex 客户端并正在挂载",
      });
      return;
    }

    const customProxy = hasCustomProxyConfig();
    sendJson(res, 200, {
      ok: false,
      requires_restart_confirm: true,
      has_custom_proxy: customProxy,
      message: customProxy
        ? "检测到 Codex 正在运行且可能配置了自定义网络代理。重启客户端可能会中断当前代理服务或重置路由。是否确认重启？"
        : "检测到 Codex 正在运行，但未开启协同调试端口。重启客户端可开启协同，是否确认重启？",
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/update/download") {
    const update = await checkUpdate();
    if (!update.has_update) {
      return sendJson(res, 200, { ok: true, skipped: true, message: "已是最新版本" });
    }
    try {
      const dest = openUpdate(update);
      sendJson(res, 200, { ok: true, dest });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message, url: update.url });
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  const line = `${nowIso()} launcher_host listening on http://127.0.0.1:${PORT}`;
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch {}
  console.log(line);
  startAttach();
});
