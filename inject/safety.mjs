const DEFAULT_REFUSED_PORTS = new Set([
  3111, // Agent Memory
  60251, // Cockpit Tools cliproxy observed in this workspace
]);

const REFUSED_NAME_PATTERN =
  /cockpit-cliproxy|cockpit-c|cockpit tools|antigravity_cockpit|codex_provider_gateway/i;

export function parsePort(value) {
  if (value == null || value === "") return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

export function parseCdpUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "缺少 TEAM_CONTEXT_CDP_URL，默认拒绝连接任何 Codex 实例。" };
  }
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "TEAM_CONTEXT_CDP_URL 不是合法 URL。" };
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
    return { ok: false, reason: `不支持的 CDP 协议: ${url.protocol}` };
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    return { ok: false, reason: "只允许连接 127.0.0.1/localhost，禁止远程调试端口。" };
  }
  const port = parsePort(url.port || (url.protocol === "https:" || url.protocol === "wss:" ? 443 : 80));
  if (!port) {
    return { ok: false, reason: "CDP URL 缺少有效端口。" };
  }
  return { ok: true, hostname, port, url: url.toString() };
}

export function collectRefusedPorts({ extraPorts = [], listenPorts = [] } = {}) {
  const refused = new Set(DEFAULT_REFUSED_PORTS);
  for (const port of extraPorts) {
    const parsed = parsePort(port);
    if (parsed) refused.add(parsed);
  }
  for (const item of listenPorts) {
    const name = `${item.command || ""} ${item.name || ""}`;
    if (REFUSED_NAME_PATTERN.test(name)) {
      const parsed = parsePort(item.port);
      if (parsed) refused.add(parsed);
    }
  }
  return refused;
}

export function parseDebuggingPortFromCommand(command) {
  const text = String(command || "");
  if (!/(?:ChatGPT|Codex)/i.test(text)) return null;
  const match = text.match(/--remote-debugging-port=(\d+)/);
  return match ? parsePort(match[1]) : null;
}

export function assertSafeCodexUiTarget({
  cdpUrl,
  extraRefusedPorts = [],
  listenPorts = [],
} = {}) {
  const parsed = parseCdpUrl(cdpUrl);
  if (!parsed.ok) return parsed;
  const refused = collectRefusedPorts({
    extraPorts: extraRefusedPorts,
    listenPorts,
  });
  if (refused.has(parsed.port)) {
    return {
      ok: false,
      reason: `拒绝连接端口 ${parsed.port}：无法将该端口用作 Codex 挂载通道，请重新检查启动状态。`,
    };
  }
  return {
    ok: true,
    hostname: parsed.hostname,
    port: parsed.port,
    url: parsed.url,
  };
}

export function assertSafeInjectTarget(options = {}) {
  return assertSafeCodexUiTarget(options);
}
