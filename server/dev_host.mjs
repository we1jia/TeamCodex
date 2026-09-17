#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";

function resolveBindHost(raw) {
  if (!raw) return "0.0.0.0";
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      return u.hostname || "0.0.0.0";
    }
  } catch {}
  let h = String(raw).trim();
  if (h.includes(":")) h = h.split(":")[0];
  if (h.includes("/")) h = h.split("/")[0];
  return h || "0.0.0.0";
}

const HOST = process.env.TEAM_CONTEXT_BIND_HOST || resolveBindHost(process.env.TEAM_CONTEXT_HOST);
const PORT = Number(process.env.TEAM_CONTEXT_PORT || 18765);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UI_FILE = path.join(ROOT, "ui", "index.html");
const DATA_DIR = process.env.TEAM_CONTEXT_DATA_DIR || path.join(ROOT, "data");
const STORE_FILE = process.env.TEAM_CONTEXT_DATA_FILE || path.join(DATA_DIR, "messages.json");

function getAllIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function getPrimaryIp() {
  const ips = getAllIps();
  // 优先寻找 10.211.55.2 (Parallels 默认网桥) 或 192.168.x.x 等
  const parallelsIp = ips.find((ip) => ip.startsWith("10.211.55."));
  if (parallelsIp) return parallelsIp;
  const lanIp = ips.find((ip) => ip.startsWith("192.168.") || ip.startsWith("10."));
  if (lanIp) return lanIp;
  return ips[0] || "127.0.0.1";
}
const primaryIp = getPrimaryIp();
const allLanIps = getAllIps();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function nowIso() {
  return new Date().toISOString();
}

function defaultRoom(id = "Media", name = "Media Engine & Platform", key = "") {
  return {
    id,
    name: name || id,
    key: key ? String(key).trim() : "",
    rules: [
      {
        id: "rule_1",
        project_id: id,
        title: "登录态 401 集中单飞刷新",
        content: "401 统一由 auth client 执行单飞刷新锁，并发请求排队等待，严禁各业务请求自行并发重试。",
        level: "P0_BLOCK",
        status: "active",
        created_by: "liuweijia",
        created_at: "2026-09-13T04:12:00.000Z",
      },
      {
        id: "rule_2",
        project_id: id,
        title: "Session Store 序列化不可变性",
        content: "session store 的二进制序列化格式严禁私自变更，优先变更 client 适配层。",
        level: "P0_BLOCK",
        status: "active",
        created_by: "liuweijia",
        created_at: "2026-09-13T04:14:08.000Z",
      },
      {
        id: "rule_3",
        project_id: id,
        title: "禁止硬编码 API 凭据与内部 Token",
        content: "所有第三方及内部服务密钥必须通过环境变量读取，代码库严禁出现明文 secret。",
        level: "P0_BLOCK",
        status: "active",
        created_by: "alex",
        created_at: "2026-09-13T05:00:00.000Z",
      },
    ],
    adrs: [
      {
        id: "adr_1",
        project_id: id,
        title: "ADR-001: 统一客户端单飞 Token 刷新机制",
        status: "accepted",
        context: "多请求并发遇到 401 时容易造成惊群效应，重复刷新可能导致 Token 覆盖作废并拖垮服务端。",
        decision: "在网络层封装单飞 Mutex，首个请求获取刷新锁并发起 refresh，后续请求挂起排队等待重试。",
        consequences: "客户端并发 401 安全收敛，大幅提升弱网重试稳定性。",
        decided_by: "liuweijia",
        decided_at: "2026-09-13T04:15:00.000Z",
      },
    ],
    members: [],
    linked_thread: {
      id: "local:01a08cca-2c7c-71f1-b0fa-03d45c8f90af",
      title: "分析Java登录迁移UnionID查询",
      selected: false,
    },
    seq: 10,
    messages: [],
    shares: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

function defaultInitialStore() {
  const mediaRoom = defaultRoom("Media", "Media Engine & Platform");
  const room1024 = defaultRoom("1024", "Team 1024 Space", "123456");
  return {
    version: 3,
    current_room_id: "1024",
    rooms: {
      "1024": room1024,
      Media: mediaRoom,
    },
  };
}

function loadStore() {
  const defaults = defaultInitialStore();
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    if (raw && typeof raw === "object") {
      // 1. 如果已经存在多房间结构
      if (raw.rooms && typeof raw.rooms === "object" && Object.keys(raw.rooms).length > 0) {
        // 清理陈旧的硬编码单人 liuweijia 与非法 URL 房间名，允许动态设备加入
        for (const [rid, r] of Object.entries(raw.rooms)) {
          if (rid.includes("http://") || rid.includes("https://") || rid.length > 50) {
            delete raw.rooms[rid];
            continue;
          }
          if (Array.isArray(r.members)) {
            r.members = r.members.filter((m) => m.id !== "liuweijia" && m.id !== "codex");
          }
        }
        if (!raw.rooms["1024"]) {
          raw.rooms["1024"] = defaultRoom("1024", "Team 1024 Space", "123456");
        }
        if (!raw.rooms["1024"].key) {
          raw.rooms["1024"].key = "123456";
        }
        return {
          version: 3,
          current_room_id: (raw.current_room_id && raw.rooms[raw.current_room_id]) ? raw.current_room_id : "1024",
          rooms: raw.rooms,
        };
      }
      // 2. 否则平滑迁移旧的单项目扁平结构
      const fallbackMedia = defaults.rooms.Media;
      const mediaRoom = {
        id: "Media",
        name: raw.projects?.[0]?.name || "Media Engine & Platform",
        key: raw.room_key || "",
        rules: Array.isArray(raw.rules) && raw.rules.length ? raw.rules : fallbackMedia.rules,
        adrs: Array.isArray(raw.adrs) && raw.adrs.length ? raw.adrs : fallbackMedia.adrs,
        members: Array.isArray(raw.members) && raw.members.length ? raw.members.filter((m) => m.id !== "liuweijia") : fallbackMedia.members,
        linked_thread: raw.linked_thread || fallbackMedia.linked_thread,
        seq: typeof raw.seq === "number" ? raw.seq : 10,
        messages: Array.isArray(raw.messages) ? raw.messages : [],
        shares: Array.isArray(raw.shares) ? raw.shares : [],
        created_at: raw.created_at || nowIso(),
        updated_at: nowIso(),
      };
      return {
        version: 3,
        current_room_id: "Media",
        rooms: {
          Media: mediaRoom,
        },
      };
    }
  } catch (err) {
    console.log("[store] 初始化新建数据文件:", err.message);
  }
  return defaults;
}

const DISCOVERY_FILE = path.join(DATA_DIR, "hub_discovery.json");

function getDiscoveryHubUrl() {
  const ips = getAllIps();
  const parallelsIp = ips.find((ip) => ip.startsWith("10.211.55."));
  if (parallelsIp) return `http://${parallelsIp}:${PORT}`;
  if (ips.includes("10.211.55.2")) return `http://10.211.55.2:${PORT}`;
  if (primaryIp && primaryIp !== "127.0.0.1") return `http://${primaryIp}:${PORT}`;
  return `http://10.211.55.2:${PORT}`;
}

function writeHubDiscovery() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const discoveryHubUrl = getDiscoveryHubUrl();
    const discoveryData = {
      hub_url: discoveryHubUrl,
      primary_ip: primaryIp,
      port: PORT,
      default_room: "1024",
      rooms: {},
      known_keys: {
        "1024": (typeof store !== "undefined" && store?.rooms?.["1024"]?.key) || "123456",
      },
      updated_at: nowIso(),
    };
    if (typeof store !== "undefined" && store?.rooms) {
      for (const [rid, r] of Object.entries(store.rooms)) {
        if (rid.includes("http://") || rid.includes("https://") || rid.length > 50) continue;
        discoveryData.rooms[rid] = { key: r.key || "" };
        if (r.key) discoveryData.known_keys[rid] = r.key;
      }
    }
    fs.writeFileSync(DISCOVERY_FILE, JSON.stringify(discoveryData, null, 2), "utf8");
  } catch (e) {
    console.error("[discovery] 写入中枢发现文件失败:", e);
  }
}

function saveStore(currentStore) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(currentStore, null, 2), "utf8");
    writeHubDiscovery();
  } catch (e) {
    console.error("[store] 保存持久化数据失败:", e);
  }
}

const store = loadStore();
saveStore(store);

const clients = new Set();
const presence = new Map();
const PRESENCE_TTL_MS = 8000;

function extractMemberInfo(req, url, body = {}) {
  return {
    memberId: String(url?.searchParams.get("member_id") || body.member_id || body.actor_id || req?.headers?.["x-member-id"] || "").trim(),
    memberName: String(url?.searchParams.get("member_name") || body.member_name || body.actor_name || req?.headers?.["x-member-name"] || "").trim(),
    clientId: String(url?.searchParams.get("client_id") || body.client_id || req?.headers?.["x-client-id"] || "").trim(),
  };
}

function upsertRoomMember(room, memberId, memberName) {
  if (!room || !memberId || memberId === "anonymous") return false;
  room.members = room.members || [];
  const existing = room.members.find((m) => m.id === memberId);
  const name = memberName || memberId;
  if (!existing) {
    const isMac = memberId.endsWith("_mac") || name.includes("(Mac)");
    const isWin = memberId.endsWith("_win") || name.includes("(Win)");
    room.members.push({
      id: memberId,
      name,
      role: "collaborator",
      title: isMac ? "Mac 协同节点" : (isWin ? "Windows 协同节点" : "协同成员"),
      avatar: isMac ? "🍎" : (isWin ? "🪟" : "👤"),
    });
    return true;
  }
  if (memberName && existing.name !== name) {
    existing.name = name;
    return true;
  }
  return false;
}

function prunePresence(now = Date.now()) {
  for (const [key, item] of presence) {
    if (!item || now - item.seenAt > PRESENCE_TTL_MS) presence.delete(key);
  }
}

function touchPresence({ roomId, memberId, memberName, clientId }) {
  const id = String(memberId || "").trim();
  if (!roomId || !id || id === "anonymous") return false;
  prunePresence();
  const beforeCount = getRoomOnlineCount(roomId);
  const beforeMembers = getRoomActiveMembers(roomId).slice().sort().join(",");
  const key = `${roomId}::${clientId || id}`;
  presence.set(key, {
    roomId,
    memberId: id,
    memberName: String(memberName || id).trim(),
    clientId: String(clientId || id),
    seenAt: Date.now(),
  });
  const afterCount = getRoomOnlineCount(roomId);
  const afterMembers = getRoomActiveMembers(roomId).slice().sort().join(",");
  if (beforeCount !== afterCount || beforeMembers !== afterMembers) {
    broadcastStatusToRoom(roomId);
  }
  return true;
}

function getRoomPresence(roomId) {
  prunePresence();
  return [...presence.values()].filter((item) => item.roomId === roomId);
}

function getRoomActiveMembers(roomId) {
  const ids = new Set();
  for (const c of clients) {
    if (c.roomId === roomId && c.memberId) ids.add(c.memberId);
  }
  for (const item of getRoomPresence(roomId)) {
    if (item.memberId) ids.add(item.memberId);
  }
  return Array.from(ids);
}

function getRoom(roomId = "Media", autoCreate = false, initialKey = "") {
  const cleanId = String(roomId || "Media").trim() || "Media";
  if (!store.rooms) store.rooms = {};
  if (!store.rooms[cleanId]) {
    if (cleanId === "Media") {
      store.rooms.Media = defaultRoom("Media", "Media Engine & Platform");
      saveStore(store);
      return store.rooms.Media;
    }
    if (!autoCreate) return null;
    store.rooms[cleanId] = {
      id: cleanId,
      name: cleanId,
      key: String(initialKey || "").trim(),
      rules: [],
      adrs: [],
      members: [],
      linked_thread: null,
      seq: 0,
      messages: [],
      shares: [],
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    saveStore(store);
  }
  return store.rooms[cleanId];
}

function getRoomOnlineCount(roomId) {
  const people = new Set();
  let fallbackCount = 0;
  for (const c of [...clients].filter((item) => item.roomId === roomId)) {
    const personKey = c.memberId || c.clientId || c.id || (c.socket ? `${c.socket.remoteAddress}:${c.socket.remotePort}` : null);
    if (personKey) people.add(String(personKey));
    else fallbackCount++;
  }
  for (const item of getRoomPresence(roomId)) {
    people.add(String(item.memberId || item.clientId));
  }
  return Math.max(1, people.size + fallbackCount);
}

function extractRoomId(req, url, body = null) {
  return (
    url?.searchParams.get("room") ||
    req.headers["x-room-id"] ||
    body?.room ||
    store.current_room_id ||
    "Media"
  );
}

function extractRoomKey(req, url, body = null) {
  const authHeader = req.headers["authorization"];
  const bearer = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  return (
    url?.searchParams.get("room_key") ||
    url?.searchParams.get("token") ||
    req.headers["x-room-key"] ||
    bearer ||
    body?.room_key ||
    body?.token ||
    ""
  );
}

function verifyRoomAuth(room, req, url, body = null) {
  if (!room) return { ok: false, status: 404, error: "room_not_found", message: "房间不存在" };
  if (!room.key) return { ok: true };
  const key = extractRoomKey(req, url, body);
  if (typeof key === "string" && typeof room.key === "string" && key.length === room.key.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(key), Buffer.from(room.key))) {
        return { ok: true };
      }
    } catch {}
  }
  return {
    ok: false,
    status: 401,
    error: "invalid_room_key",
    message: "房间访问密码错误，请提供正确的 Secret Token / Room Key",
  };
}

function sanitizeLinkedThread(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id != null ? String(raw.id).slice(0, 256) : "";
  const title = raw.title != null ? String(raw.title).slice(0, 512) : "";
  if (!id && !title) return null;
  return {
    id: id || `thread_${Date.now()}`,
    title: title || "当前对话",
  };
}

function snapshot(room) {
  const activeRules = (room.rules || []).filter((r) => r.status !== "archived");
  const acceptedAdrs = (room.adrs || []).filter((a) => a.status === "accepted");
  const activeMembers = getRoomActiveMembers(room.id);
  return {
    version: 3,
    room: {
      id: room.id,
      name: room.name,
      has_key: Boolean(room.key),
    },
    online_count: getRoomOnlineCount(room.id),
    active_members: activeMembers,
    project_id: room.id,
    current_project: { id: room.id, name: room.name },
    projects: Object.values(store.rooms).map((r) => ({ id: r.id, name: r.name })),
    rules: room.rules || [],
    adrs: room.adrs || [],
    requirement_version: 4,
    decision_version: 3,
    seq: room.seq || 0,
    members: room.members || [],
    linked_thread: room.linked_thread || null,
    messages: room.messages || [],
    shares: (room.shares || []).map((s) => ({
      id: s.id,
      title: s.title,
      token: s.token,
      status: s.status,
      created_by: s.created_by,
      created_at: s.created_at,
      hook_url: `http://${primaryIp}:${PORT}/api/shared/${s.id}/compact.txt?token=${s.token}&room=${encodeURIComponent(room.id)}`,
    })),
  };
}

function compactSnapshot(room) {
  const snap = snapshot(room);
  const all = snap.messages || [];
  const keyRe = /不行|不要|必须|确认|方案|冲突|未确认|先改|禁止|采用|统一|单飞/;
  const picked = [];
  const seen = new Set();
  const take = (item, isKey) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    picked.push({
      seq: item.seq,
      actor: item.actor_id,
      type: item.actor_type,
      text: String(item.content || "").replace(/\s+/g, " ").slice(0, 120),
      isKey,
    });
  };
  all.filter((item) => keyRe.test(item.content || "")).forEach((item) => take(item, true));
  all.slice(-4).forEach((item) => take(item, false));
  picked.sort((a, b) => (a.seq || 0) - (b.seq || 0));

  const activeRules = (room.rules || []).filter((r) => r.status === "active");
  const acceptedAdrs = (room.adrs || []).filter((a) => a.status === "accepted");

  return {
    room: snap.room,
    project: snap.current_project,
    rules: activeRules,
    adrs: acceptedAdrs,
    linked_thread: snap.linked_thread,
    members: (snap.members || []).map((item) => item.name || item.id),
    requirement_version: snap.requirement_version,
    decision_version: snap.decision_version,
    recent: picked,
    omitted: Math.max(0, all.length - picked.length),
  };
}

function compactText(room) {
  const data = compactSnapshot(room);
  const lines = [
    `<TEAM_CONTEXT>`,
    `# 团队架构与行为约束 (Team Context Hub · Room: ${data.room?.id || "Media"} · v${data.requirement_version}.${data.decision_version})`,
    `空间: ${data.room?.name || "Media"} | 成员共识: ${(data.members || []).join("、")}`,
  ];

  if (data.rules && data.rules.length) {
    lines.push(`\n【必须严格遵守的技术红线 (Guardrails)】:`);
    data.rules.forEach((r, idx) => {
      lines.push(`${idx + 1}. [${r.level || "P0"}] ${r.title}: ${r.content}`);
    });
  }

  if (data.adrs && data.adrs.length) {
    lines.push(`\n【生效中的架构决策 (ADR)】:`);
    data.adrs.forEach((a) => {
      lines.push(`- [${a.title}] 决议: ${a.decision}`);
    });
  }

  lines.push(`\n【当前绑定对话与最近决议】:`);
  lines.push(`- 关联对话: ${data.linked_thread?.title || "未指定关联"}`);
  if (!data.recent.length) {
    lines.push(`- 暂无特定讨论摘要`);
  } else {
    for (const item of data.recent) {
      lines.push(`- ${item.isKey ? "[核心意见] " : ""}${item.actor}: ${item.text}`);
    }
  }

  if (data.omitted) {
    lines.push(`(已自动压缩并剔除 ${data.omitted} 条日常对话，完整上下文请访问 Web 端管理中枢)`);
  }
  lines.push(`</TEAM_CONTEXT>`);
  return lines.join("\n");
}

function sharedCompactText(share) {
  const d = share.data || {};
  const lines = [
    `<TEAM_CONTEXT>`,
    `# 同事主动授权共享的方案上下文 (Shared by: ${share.created_by || "同事"} · ${share.title || "技术方案"})`,
    `共享编号: ${share.id} | 授权时间: ${share.created_at || nowIso()}`,
  ];

  if (d.rules && d.rules.length) {
    lines.push(`\n【共享的技术红线与行为约束 (Guardrails)】:`);
    d.rules.forEach((r, idx) => {
      lines.push(`${idx + 1}. [${r.level || "P0"}] ${r.title}: ${r.content}`);
    });
  }

  if (d.adrs && d.adrs.length) {
    lines.push(`\n【共享的架构决策 (ADR)】:`);
    d.adrs.forEach((a) => {
      lines.push(`- [${a.title}] 决议: ${a.decision}`);
    });
  }

  if (d.linked_thread?.title) {
    lines.push(`\n【来源关联对话】: ${d.linked_thread.title}`);
  }

  if (d.recent && d.recent.length) {
    lines.push(`\n【核心讨论与建议要点】:`);
    for (const item of d.recent) {
      lines.push(`- ${item.actor || "成员"}: ${item.text}`);
    }
  }

  lines.push(`</TEAM_CONTEXT>`);
  return lines.join("\n");
}

function broadcastToRoom(roomId, event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    if (client.roomId === roomId) {
      try {
        client.write(data);
      } catch {
        clients.delete(client);
      }
    }
  }
}

function broadcastSnapshotToRoom(roomId) {
  const room = getRoom(roomId, false);
  if (!room) return;
  broadcastToRoom(roomId, "snapshot", snapshot(room));
}

function broadcastStatusToRoom(roomId) {
  const room = getRoom(roomId, false);
  if (!room) return;
  const status = {
    room: { id: room.id, name: room.name, has_key: Boolean(room.key) },
    online_count: getRoomOnlineCount(roomId),
    active_members: getRoomActiveMembers(roomId),
  };
  broadcastToRoom(roomId, "room_status", status);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Room-Id,X-Room-Key,*",
    "Access-Control-Allow-Private-Network": "true",
    "Content-Security-Policy": "frame-ancestors *",
  };
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(),
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

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // 1. Web 静态主页与注入文件路由
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    serveFile(res, UI_FILE);
    return;
  }
  if (req.method === "GET" && url.pathname === "/inject/sidebar_fullscreen.js") {
    serveFile(res, path.join(ROOT, "inject", "sidebar_fullscreen.js"));
    return;
  }
  if (req.method === "GET" && url.pathname === "/windows/mock-codex-host.html") {
    serveFile(res, path.join(ROOT, "windows", "mock-codex-host.html"));
    return;
  }

  // 2. 状态检查与健康接口
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "team-context-hub",
      isolated: true,
      version: "3.1.0",
      host: HOST,
      port: PORT,
      primaryIp,
      lanIps: allLanIps,
      lanUrl: `http://${primaryIp}:${PORT}`,
      timestamp: nowIso(),
    });
    return;
  }

  // 3. 房间列表与管理接口 (Rooms API)
  if (url.pathname === "/api/rooms") {
    if (req.method === "GET") {
      const roomList = Object.values(store.rooms || {}).map((r) => ({
        id: r.id,
        name: r.name,
        has_key: Boolean(r.key),
        online_count: getRoomOnlineCount(r.id),
        member_count: (r.members || []).length,
        message_count: (r.messages || []).length,
        updated_at: r.updated_at || r.created_at || nowIso(),
      }));
      sendJson(res, 200, roomList);
      return;
    }
  }

  // 3.0 删除协作空间（默认 Media 为系统空间，不允许删除）
  if (req.method === "DELETE" && url.pathname.startsWith("/api/rooms/")) {
    const encodedRoomId = url.pathname.slice("/api/rooms/".length);
    let roomId = "";
    try {
      roomId = decodeURIComponent(encodedRoomId).trim();
    } catch {
      return sendJson(res, 400, { ok: false, error: "invalid_room_id", message: "房间名称无效" });
    }
    if (!roomId || roomId.includes("/")) {
      return sendJson(res, 400, { ok: false, error: "invalid_room_id", message: "房间名称无效" });
    }
    if (roomId === "Media") {
      return sendJson(res, 409, { ok: false, error: "protected_room", message: "系统空间 Media 不允许删除" });
    }

    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }

    let body = {};
    try { body = JSON.parse((await readBody(req)) || "{}"); } catch {}
    const auth = verifyRoomAuth(room, req, url, body);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }
    if (String(body.confirm_room || "").trim() !== roomId) {
      return sendJson(res, 400, {
        ok: false,
        error: "confirmation_required",
        message: "请在 confirm_room 中再次填写完整房间名称",
      });
    }

    delete store.rooms[roomId];
    if (store.current_room_id === roomId) store.current_room_id = "Media";
    saveStore(store);

    const deletionEvent = `event: room_deleted\ndata: ${JSON.stringify({
      room_id: roomId,
      fallback_room: "Media",
      message: `空间 ${roomId} 已被删除，请切换到 Media`,
    })}\n\n`;
    for (const client of Array.from(clients)) {
      if (client.roomId !== roomId) continue;
      try {
        client.write(deletionEvent);
        client.end();
      } catch {}
      clients.delete(client);
    }

    sendJson(res, 200, {
      ok: true,
      deleted: { id: room.id, name: room.name },
      fallback_room: "Media",
    });
    return;
  }

  // 3.1 验证房间与密码校验接口
  if (req.method === "POST" && url.pathname === "/api/rooms/verify") {
    let body = {};
    try { body = JSON.parse((await readBody(req)) || "{}"); } catch {}
    const roomId = String(body.room || "Media").trim() || "Media";
    const roomKey = String(body.room_key || "").trim();
    const autoCreate = body.auto_create !== false;

    let room = getRoom(roomId, false);
    const member = extractMemberInfo(req, url, body);
    if (!room) {
      if (autoCreate) {
        room = getRoom(roomId, true, roomKey);
        if (upsertRoomMember(room, member.memberId, member.memberName)) saveStore(store);
        touchPresence({ roomId: room.id, ...member });
        return sendJson(res, 200, {
          ok: true,
          created: true,
          room: { id: room.id, name: room.name, has_key: Boolean(room.key) },
          online_count: getRoomOnlineCount(room.id),
          active_members: getRoomActiveMembers(room.id),
        });
      } else {
        return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
      }
    }

    const auth = verifyRoomAuth(room, req, url, body);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    if (upsertRoomMember(room, member.memberId, member.memberName)) saveStore(store);
    touchPresence({ roomId: room.id, ...member });
    sendJson(res, 200, {
      ok: true,
      room: { id: room.id, name: room.name, has_key: Boolean(room.key) },
      online_count: getRoomOnlineCount(room.id),
      active_members: getRoomActiveMembers(room.id),
    });
    return;
  }

  // 3.2 房间配置更新（改名、设置密码、修改密码）
  if (req.method === "POST" && url.pathname === "/api/rooms/config") {
    let body = {};
    try { body = JSON.parse((await readBody(req)) || "{}"); } catch {}
    const roomId = extractRoomId(req, url, body);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url, body);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }
    if (body.new_name && String(body.new_name).trim()) room.name = String(body.new_name).trim();
    if (body.new_key !== undefined) {
      const oldKey = room.key;
      room.key = String(body.new_key).trim();
      if (oldKey !== room.key) {
        // 密码变更后，主动通知并断开持有旧密钥的 SSE 连接
        for (const client of Array.from(clients)) {
          if (client.roomId === room.id && client.roomKey !== room.key) {
            try {
              client.write(`event: auth_revoked\ndata: ${JSON.stringify({ error: "room_key_changed", message: "房间密钥已更新，请重新输入" })}\n\n`);
              client.end();
            } catch {}
            clients.delete(client);
          }
        }
      }
    }
    room.updated_at = nowIso();
    saveStore(store);
    broadcastSnapshotToRoom(room.id);
    broadcastStatusToRoom(room.id);
    sendJson(res, 200, {
      ok: true,
      room: { id: room.id, name: room.name, has_key: Boolean(room.key) },
    });
    return;
  }

  // 3.1. 跨平台系统剪贴板读取辅助接口 (支持 macOS 与 Windows)
  if (req.method === "GET" && url.pathname === "/api/clipboard") {
    let clipText = "";
    try {
      if (process.platform === "darwin") {
        clipText = execSync("pbpaste", { timeout: 1000 }).toString();
      } else if (process.platform === "win32") {
        clipText = execSync("powershell.exe -NoProfile -Command Get-Clipboard", { timeout: 1000 }).toString();
      }
    } catch {}
    sendJson(res, 200, { ok: true, text: clipText.trim() });
    return;
  }

  // 4. 快照与压缩上下文 (按 room 隔离)
  if (req.method === "GET" && url.pathname === "/api/snapshot") {
    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }
    const member = extractMemberInfo(req, url);
    if (member.memberId) {
      if (upsertRoomMember(room, member.memberId, member.memberName)) saveStore(store);
      touchPresence({ roomId: room.id, ...member });
    }
    sendJson(res, 200, url.searchParams.get("compact") === "1" ? compactSnapshot(room) : snapshot(room));
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/compact.txt" || url.pathname === "/api/context/compact")) {
    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    if (!room) {
      res.writeHead(404, {
        ...corsHeaders(),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end("404 Not Found: 房间不存在");
      return;
    }
    const auth = verifyRoomAuth(room, req, url);
    if (!auth.ok) {
      res.writeHead(auth.status, {
        ...corsHeaders(),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(`401 Unauthorized: ${auth.message}`);
      return;
    }
    const text = compactText(room);
    res.writeHead(200, {
      ...corsHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(text);
    return;
  }

  // 4.1 主动授权共享安全 Hook 接口 (供同事挂载)
  if (url.pathname.startsWith("/api/shared/")) {
    const subPath = url.pathname.slice("/api/shared/".length);
    const parts = subPath.split("/");
    const shareId = parts[0];
    const isCompactTxt = parts[1] === "compact.txt";

    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    const share = room ? (room.shares || []).find((s) => s.id === shareId) : null;
    const token = url.searchParams.get("token");

    if (!share || share.status !== "active" || !token || share.token !== token) {
      res.writeHead(403, {
        ...corsHeaders(),
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end("403 Forbidden: 上下文未主动共享、已撤销或安全凭证(token)无效。严禁未经授权读取。");
      return;
    }

    if (isCompactTxt || req.headers.accept?.includes("text/plain")) {
      const text = sharedCompactText(share);
      res.writeHead(200, {
        ...corsHeaders(),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(text);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      share: {
        id: share.id,
        title: share.title,
        created_by: share.created_by,
        created_at: share.created_at,
        data: share.data,
      },
    });
    return;
  }

  // 4.2 主动共享管理接口 (在当前 room 下)
  if (url.pathname === "/api/shares") {
    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    if (req.method === "GET") {
      const list = (room.shares || []).map((s) => ({
        id: s.id,
        title: s.title,
        token: s.token,
        status: s.status,
        created_by: s.created_by,
        created_at: s.created_at,
        hook_url: `http://${primaryIp}:${PORT}/api/shared/${s.id}/compact.txt?token=${s.token}&room=${encodeURIComponent(room.id)}`,
      }));
      sendJson(res, 200, list);
      return;
    }

    if (req.method === "POST") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch {}

      const token = `sec_${crypto.randomBytes(8).toString("hex")}`;
      const shareId = `share_${Date.now().toString(36)}`;
      const newShare = {
        id: shareId,
        token,
        title: String(body.title || room.linked_thread?.title || "主动共享上下文").trim(),
        status: "active",
        created_by: String(body.created_by || "liuweijia"),
        created_at: nowIso(),
        data: {
          rules: (room.rules || []).filter((r) => r.status === "active"),
          adrs: (room.adrs || []).filter((a) => a.status === "accepted"),
          linked_thread: room.linked_thread || null,
          recent: (room.messages || []).slice(-6).map((m) => ({
            actor: m.actor_id,
            text: String(m.content || "").replace(/\s+/g, " ").slice(0, 150),
          })),
        },
      };

      room.shares = room.shares || [];
      room.shares.unshift(newShare);
      room.updated_at = nowIso();
      saveStore(store);
      broadcastSnapshotToRoom(room.id);

      sendJson(res, 201, {
        ok: true,
        share: {
          id: newShare.id,
          title: newShare.title,
          token: newShare.token,
          status: newShare.status,
          hook_url: `http://${primaryIp}:${PORT}/api/shared/${newShare.id}/compact.txt?token=${newShare.token}&room=${encodeURIComponent(room.id)}`,
        },
      });
      return;
    }
  }

  if (url.pathname.startsWith("/api/shares/") && url.pathname.endsWith("/revoke") && req.method === "POST") {
    const shareId = url.pathname.slice("/api/shares/".length).replace(/\/revoke$/, "");
    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { error: "room not found" });
    }
    const share = (room.shares || []).find((s) => s.id === shareId);
    if (!share) {
      sendJson(res, 404, { error: "share not found" });
      return;
    }
    share.status = "revoked";
    share.revoked_at = nowIso();
    room.updated_at = nowIso();
    saveStore(store);
    broadcastSnapshotToRoom(room.id);
    sendJson(res, 200, { ok: true, message: "已安全撤销该 Hook 访问权限，他人将无法再读取", share });
    return;
  }

  // 5. SSE 实时事件总线 (支持按 room 隔离与鉴权)
  if (req.method === "GET" && url.pathname === "/api/events") {
    const roomId = extractRoomId(req, url);
    const memberId = url.searchParams.get("member_id") || "anonymous";
    const memberName = url.searchParams.get("member_name") || memberId;
    const clientId = url.searchParams.get("client_id") || `client_${Math.random().toString(36).slice(2)}_${Date.now()}`;

    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    res.writeHead(200, {
      ...corsHeaders(),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });

    res.roomId = room.id;
    res.roomKey = extractRoomKey(req, url);
    res.memberId = memberId;
    res.memberName = memberName;
    res.clientId = clientId;

    // 新设备动态加入成员列表
    room.members = room.members || [];
    let memberAdded = false;
    if (memberId && memberId !== "anonymous" && !room.members.some((m) => m.id === memberId)) {
      const isMac = memberId.endsWith("_mac") || memberName.includes("(Mac)");
      const isWin = memberId.endsWith("_win") || memberName.includes("(Win)");
      room.members.push({
        id: memberId,
        name: memberName,
        role: "collaborator",
        title: isMac ? "Mac 协同节点" : (isWin ? "Windows 协同节点" : "协同成员"),
        avatar: isMac ? "🍎" : (isWin ? "🪟" : "👤"),
      });
      memberAdded = true;
      saveStore(store);
    } else if (memberId && memberId !== "anonymous") {
      const existing = room.members.find((m) => m.id === memberId);
      if (existing && memberName && existing.name !== memberName) {
        existing.name = memberName;
        memberAdded = true;
        saveStore(store);
      }
    }

    clients.add(res);

    // 立即推送当前房间快照
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot(room))}\n\n`);

    // 广播房间成员与在线状态更新
    if (memberAdded) {
      broadcastSnapshotToRoom(room.id);
    }
    broadcastStatusToRoom(room.id);

    req.on("close", () => {
      clients.delete(res);
      broadcastStatusToRoom(room.id);
    });
    return;
  }

  // 6. 规则管理 (Rules & Guardrails API)
  if (url.pathname === "/api/rules") {
    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    if (req.method === "GET") {
      sendJson(res, 200, room.rules || []);
      return;
    }
    if (req.method === "POST") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch {}
      if (!body.title || !body.content) {
        sendJson(res, 400, { error: "title and content required" });
        return;
      }
      const newRule = {
        id: `rule_${Date.now()}`,
        project_id: room.id,
        title: String(body.title).trim(),
        content: String(body.content).trim(),
        level: ["P0_BLOCK", "P1_WARN", "INFO"].includes(body.level) ? body.level : "P0_BLOCK",
        status: body.status === "archived" ? "archived" : "active",
        created_by: body.created_by || "liuweijia",
        created_at: nowIso(),
      };
      room.rules = room.rules || [];
      room.rules.unshift(newRule);
      room.updated_at = nowIso();
      saveStore(store);
      broadcastSnapshotToRoom(room.id);
      sendJson(res, 201, newRule);
      return;
    }
  }

  if (url.pathname.startsWith("/api/rules/")) {
    const ruleId = url.pathname.slice("/api/rules/".length);
    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    const index = (room.rules || []).findIndex((r) => r.id === ruleId);
    if (index === -1) {
      sendJson(res, 404, { error: "rule not found" });
      return;
    }

    if (req.method === "PUT") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch {}
      room.rules[index] = {
        ...room.rules[index],
        ...body,
        updated_at: nowIso(),
      };
      room.updated_at = nowIso();
      saveStore(store);
      broadcastSnapshotToRoom(room.id);
      sendJson(res, 200, room.rules[index]);
      return;
    }

    if (req.method === "DELETE") {
      const deleted = room.rules.splice(index, 1);
      room.updated_at = nowIso();
      saveStore(store);
      broadcastSnapshotToRoom(room.id);
      sendJson(res, 200, { success: true, deleted: deleted[0] });
      return;
    }
  }

  // 7. 架构决策管理 (ADRs API)
  if (url.pathname === "/api/adrs") {
    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    if (req.method === "GET") {
      sendJson(res, 200, room.adrs || []);
      return;
    }
    if (req.method === "POST") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch {}
      if (!body.title || !body.decision) {
        sendJson(res, 400, { error: "title and decision required" });
        return;
      }
      const newAdr = {
        id: `adr_${Date.now()}`,
        project_id: room.id,
        title: String(body.title).trim(),
        status: ["accepted", "proposed", "rejected", "superseded"].includes(body.status) ? body.status : "accepted",
        context: String(body.context || "").trim(),
        decision: String(body.decision).trim(),
        consequences: String(body.consequences || "").trim(),
        decided_by: body.decided_by || "liuweijia",
        decided_at: nowIso(),
      };
      room.adrs = room.adrs || [];
      room.adrs.unshift(newAdr);
      room.updated_at = nowIso();
      saveStore(store);
      broadcastSnapshotToRoom(room.id);
      sendJson(res, 201, newAdr);
      return;
    }
  }

  if (url.pathname.startsWith("/api/adrs/")) {
    const adrId = url.pathname.slice("/api/adrs/".length);
    const roomId = extractRoomId(req, url);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    const index = (room.adrs || []).findIndex((a) => a.id === adrId);
    if (index === -1) {
      sendJson(res, 404, { error: "adr not found" });
      return;
    }

    if (req.method === "PUT") {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || "{}"); } catch {}
      room.adrs[index] = {
        ...room.adrs[index],
        ...body,
        updated_at: nowIso(),
      };
      room.updated_at = nowIso();
      saveStore(store);
      broadcastSnapshotToRoom(room.id);
      sendJson(res, 200, room.adrs[index]);
      return;
    }

    if (req.method === "DELETE") {
      const deleted = room.adrs.splice(index, 1);
      room.updated_at = nowIso();
      saveStore(store);
      broadcastSnapshotToRoom(room.id);
      sendJson(res, 200, { success: true, deleted: deleted[0] });
      return;
    }
  }

  // 8. 团队消息发送 (Messages API)
  if (req.method === "POST" && url.pathname === "/api/messages") {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid json" });
      return;
    }
    const roomId = extractRoomId(req, url, body);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在，请先创建或加入房间" });
    }
    const auth = verifyRoomAuth(room, req, url, body);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    const content = String(body.content || "").trim();
    if (!content) {
      sendJson(res, 400, { error: "content required" });
      return;
    }
    const clientMessageId = String(body.client_message_id || "").trim().slice(0, 128);
    if (clientMessageId) {
      const existing = (room.messages || []).find((item) => item.client_message_id === clientMessageId);
      if (existing) {
        sendJson(res, 200, existing);
        return;
      }
    }
    const actorType = body.actor_type === "ai" ? "ai" : "human";
    const defaultActorId = actorType === "ai" ? "codex" : "collaborator";
    const actorId = String(body.actor_id || defaultActorId);
    const actorName = String(body.actor_name || actorId);

    // 允许不同 memberId（如 weijia_mac 与 weijia_win）作为独立成员追加至 room.members
    let memberUpdated = false;
    if (actorType === "human" && actorId && actorId !== "anonymous") {
      room.members = room.members || [];
      const existing = room.members.find((m) => m.id === actorId);
      if (!existing) {
        const isMac = actorId.endsWith("_mac") || actorName.includes("(Mac)");
        const isWin = actorId.endsWith("_win") || actorName.includes("(Win)");
        room.members.push({
          id: actorId,
          name: actorName,
          role: "collaborator",
          title: isMac ? "Mac 协同节点" : (isWin ? "Windows 协同节点" : "协同成员"),
          avatar: isMac ? "🍎" : (isWin ? "🪟" : "👤"),
        });
        memberUpdated = true;
      } else if (body.actor_name && existing.name !== actorName) {
        existing.name = actorName;
        memberUpdated = true;
      }
    }

    // 防重复发送保护：相同发言者在 2 秒内发送完全相同内容的普通消息，自动防重去重
    const lastMsg = (room.messages || [])[room.messages.length - 1];
    if (lastMsg && lastMsg.actor_id === actorId && lastMsg.content === content) {
      const diffMs = Date.now() - new Date(lastMsg.created_at).getTime();
      if (diffMs >= 0 && diffMs < 2000) {
        sendJson(res, 200, lastMsg);
        return;
      }
    }

    room.seq = (room.seq || 0) + 1;
    const message = {
      id: `msg_${room.seq}`,
      seq: room.seq,
      actor_type: actorType,
      actor_id: actorId,
      actor_name: actorName,
      content,
      linked_thread: sanitizeLinkedThread(body.linked_thread) || sanitizeLinkedThread(room.linked_thread) || null,
      mentions: Array.isArray(body.mentions) ? body.mentions : [],
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : null,
      created_at: nowIso(),
      ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
    };
    room.messages = room.messages || [];
    room.messages.push(message);
    room.updated_at = nowIso();
    saveStore(store);
    if (memberUpdated) {
      broadcastSnapshotToRoom(room.id);
    }
    broadcastToRoom(room.id, "message", message);
    broadcastToRoom(room.id, "chat", message);
    sendJson(res, 201, message);
    return;
  }

  // 9. 成员管理与上下文配置
  if (req.method === "POST" && url.pathname === "/api/context") {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid json" });
      return;
    }
    const roomId = extractRoomId(req, url, body);
    const room = getRoom(roomId, false);
    if (!room) {
      return sendJson(res, 404, { ok: false, error: "room_not_found", message: "房间不存在" });
    }
    const auth = verifyRoomAuth(room, req, url, body);
    if (!auth.ok) {
      return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
    }

    if (body.linked_thread !== undefined) room.linked_thread = body.linked_thread || null;
    if (Array.isArray(body.members)) room.members = body.members;
    if (body.member && body.member.name) {
      const id = String(body.member.id || body.member.name);
      room.members = room.members || [];
      if (!room.members.some((item) => item.id === id)) {
        room.members.push({
          id,
          name: String(body.member.name),
          role: body.member.role || "developer",
          title: body.member.title || "工程师",
          avatar: body.member.avatar || "👤",
        });
      }
    }
    room.updated_at = nowIso();
    saveStore(store);
    broadcastSnapshotToRoom(room.id);
    sendJson(res, 200, snapshot(room));
    return;
  }

  // 10. 打开系统默认浏览器 (Open URL API)
  if (req.method === "POST" && url.pathname === "/api/open-url") {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid json" });
      return;
    }
    const targetUrl = String(body.url || "").trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      sendJson(res, 400, { error: "invalid url: only http and https allowed" });
      return;
    }
    try {
      if (process.platform === "darwin") {
        spawn("/usr/bin/open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
      } else if (process.platform === "win32") {
        spawn("cmd.exe", ["/c", "start", "", targetUrl], { detached: true, stdio: "ignore" }).unref();
      } else {
        spawn("xdg-open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
      }
      sendJson(res, 200, { ok: true, opened: targetUrl });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[error] 端口 ${PORT} 已被占用，请先停止旧服务或修改 TEAM_CONTEXT_PORT`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  const primaryIp = ips[0] || "127.0.0.1";
  writeHubDiscovery();
  console.log(`[team-context] 协同 Hub 服务已启动！(支持多房间分流与密钥鉴权)`);
  console.log(`  > 本机控制台: http://127.0.0.1:${PORT}/`);
  console.log(`  > 同事局域网访问: http://${primaryIp}:${PORT}/`);
  console.log(`  > 默认房间 Media: http://${primaryIp}:${PORT}/api/compact.txt?room=Media`);
  console.log(`  > 共享发现配置已写入: ${DISCOVERY_FILE}`);
});
