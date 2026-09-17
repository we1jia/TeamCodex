import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeCodexUiTarget,
  collectRefusedPorts,
  parseDebuggingPortFromCommand,
} from "../inject/safety.mjs";

test("refuses missing CDP URL", () => {
  const result = assertSafeCodexUiTarget({});
  assert.equal(result.ok, false);
  assert.match(result.reason, /TEAM_CONTEXT_CDP_URL/);
});

test("refuses cockpit cliproxy port", () => {
  const result = assertSafeCodexUiTarget({
    cdpUrl: "http://127.0.0.1:60251",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /60251/);
});

test("refuses ports owned by cockpit-cliproxy listeners", () => {
  const result = assertSafeCodexUiTarget({
    cdpUrl: "http://127.0.0.1:55828",
    listenPorts: [{ port: 55828, command: "cockpit-cliproxy --config /tmp/x" }],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /55828/);
});

test("collects refused ports from truncated lsof cockpit names", () => {
  const refused = collectRefusedPorts({
    listenPorts: [
      { port: 18765, command: "node" },
      { port: 49999, command: "cockpit-c" },
    ],
  });
  assert.equal(refused.has(18765), false);
  assert.equal(refused.has(49999), true);
  assert.equal(refused.has(60251), true);
});

test("accepts ChatGPT debugging port that is not a cockpit listener", () => {
  const result = assertSafeCodexUiTarget({
    cdpUrl: "http://127.0.0.1:55828",
    listenPorts: [
      { port: 55828, command: "ChatGPT" },
      { port: 60251, command: "cockpit-c" },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.port, 55828);
});

test("parses ChatGPT remote debugging port and ignores Chrome", () => {
  const chatgpt =
    "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT --remote-debugging-address=127.0.0.1 --remote-debugging-port=55828";
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222";
  assert.equal(parseDebuggingPortFromCommand(chatgpt), 55828);
  assert.equal(parseDebuggingPortFromCommand(chrome), null);
});
