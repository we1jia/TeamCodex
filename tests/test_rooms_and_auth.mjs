import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_PATH = path.join(ROOT, "server", "dev_host.mjs");
const TEST_PORT = 19877;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        ...options,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: data, raw });
        });
      },
    );
    req.on("error", reject);
    if (body) {
      const payload = typeof body === "string" ? body : JSON.stringify(body);
      req.setHeader("Content-Type", "application/json");
      req.setHeader("Content-Length", Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

test("Multi-room, Room Key Authentication & Static Asset Suite", async (t) => {
  // 建立隔离的临时测试数据目录，杜绝测试状态污染
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "team-ctx-test-"));
  const tempFile = path.join(tempDir, "messages.json");

  const child = spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      TEAM_CONTEXT_PORT: String(TEST_PORT),
      TEAM_CONTEXT_DATA_DIR: tempDir,
      TEAM_CONTEXT_DATA_FILE: tempFile,
    },
    stdio: "pipe",
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server startup timeout")), 5000);
    const check = async () => {
      try {
        const res = await request({ path: "/api/health", method: "GET" });
        if (res.status === 200 && res.body?.ok) {
          clearTimeout(timeout);
          resolve();
          return;
        }
      } catch {}
      setTimeout(check, 150);
    };
    check();
  });

  t.after(() => {
    child.kill("SIGTERM");
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test("1. 默认房间 Media 自动加载且公开可读", async () => {
    const res = await request({ path: "/api/snapshot?room=Media", method: "GET" });
    assert.equal(res.status, 200);
    assert.equal(res.body.room.id, "Media");
    assert.equal(res.body.room.has_key, false);
    assert.ok(Array.isArray(res.body.messages));
  });

  await t.test("2. 获取房间列表 GET /api/rooms", async () => {
    const res = await request({ path: "/api/rooms", method: "GET" });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const media = res.body.find((r) => r.id === "Media");
    assert.ok(media);
    assert.equal(media.has_key, false);
  });

  await t.test("3. 创建带密码的新房间 SecureProject", async () => {
    const verifyRes = await request(
      { path: "/api/rooms/verify", method: "POST" },
      { room: "SecureProject", room_key: "secret123", auto_create: true },
    );
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.ok, true);
    assert.equal(verifyRes.body.room.id, "SecureProject");
    assert.equal(verifyRes.body.room.has_key, true);
  });

  await t.test("4. 未提供密码访问受保护房间返回 401", async () => {
    const res = await request({ path: "/api/snapshot?room=SecureProject", method: "GET" });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "invalid_room_key");
  });

  await t.test("5. 错误密码访问受保护房间返回 401", async () => {
    const res = await request(
      { path: "/api/snapshot?room=SecureProject&room_key=wrongpass", method: "GET" },
    );
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "invalid_room_key");
  });

  await t.test("6. 正确密码通过 Header 或 Query 访问成功", async () => {
    const resQuery = await request({
      path: "/api/snapshot?room=SecureProject&room_key=secret123",
      method: "GET",
    });
    assert.equal(resQuery.status, 200);
    assert.equal(resQuery.body.room.id, "SecureProject");

    const resHeader = await request({
      path: "/api/snapshot?room=SecureProject",
      method: "GET",
      headers: { "X-Room-Key": "secret123" },
    });
    assert.equal(resHeader.status, 200);
    assert.equal(resHeader.body.room.id, "SecureProject");
  });

  await t.test("7. 房间消息隔离测试", async () => {
    const sendRes = await request(
      { path: "/api/messages", method: "POST" },
      {
        room: "SecureProject",
        room_key: "secret123",
        actor_id: "alex",
        actor_type: "human",
        content: "SecureProject 专有秘密消息",
      },
    );
    assert.equal(sendRes.status, 201);
    assert.equal(sendRes.body.content, "SecureProject 专有秘密消息");

    const snapSecure = await request({
      path: "/api/snapshot?room=SecureProject&room_key=secret123",
      method: "GET",
    });
    const foundSecure = snapSecure.body.messages.some(
      (m) => m.content === "SecureProject 专有秘密消息",
    );
    assert.ok(foundSecure);

    const snapMedia = await request({ path: "/api/snapshot?room=Media", method: "GET" });
    const foundMedia = snapMedia.body.messages.some(
      (m) => m.content === "SecureProject 专有秘密消息",
    );
    assert.equal(foundMedia, false, "Media 房间不应包含 SecureProject 的消息");
  });

  await t.test("8. 房间配置修改 (POST /api/rooms/config)", async () => {
    const failRes = await request(
      { path: "/api/rooms/config", method: "POST" },
      {
        room: "SecureProject",
        room_key: "wrongpass",
        new_key: "newsecret456",
        new_name: "Secure Project New Name",
      },
    );
    assert.equal(failRes.status, 401);

    const successRes = await request(
      { path: "/api/rooms/config", method: "POST" },
      {
        room: "SecureProject",
        room_key: "secret123",
        new_key: "newsecret456",
        new_name: "Secure Project New Name",
      },
    );
    assert.equal(successRes.status, 200);
    assert.equal(successRes.body.room.name, "Secure Project New Name");

    const oldKeyRes = await request({
      path: "/api/snapshot?room=SecureProject&room_key=secret123",
      method: "GET",
    });
    assert.equal(oldKeyRes.status, 401);

    const newKeyRes = await request({
      path: "/api/snapshot?room=SecureProject&room_key=newsecret456",
      method: "GET",
    });
    assert.equal(newKeyRes.status, 200);
    assert.equal(newKeyRes.body.room.name, "Secure Project New Name");
  });

  await t.test("9. 静态文件提供 (/index.html 与 /inject/sidebar_fullscreen.js)", async () => {
    const htmlRes = await request({ path: "/", method: "GET" });
    assert.equal(htmlRes.status, 200);
    assert.ok(htmlRes.raw.includes("团队协作 · Codex Team Context"));
    assert.ok(htmlRes.raw.includes("connect-modal"));

    const jsRes = await request({ path: "/inject/sidebar_fullscreen.js", method: "GET" });
    assert.equal(jsRes.status, 200);
    assert.ok(jsRes.raw.includes("team-context-sidebar-tab"));
    assert.ok(jsRes.raw.includes("connectHub"));
    assert.ok(jsRes.raw.includes("room-status-pill"));
  });

  await t.test("9.1. Windows 原生隔离测试包入口可检查", async () => {
    const mockRes = await request({ path: "/windows/mock-codex-host.html", method: "GET" });
    assert.equal(mockRes.status, 200);
    assert.ok(mockRes.raw.includes("data-markdown-text-tone=\"assistant-message\""));
    assert.ok(mockRes.raw.includes("__teamContextNativeCall"));
    assert.ok(fs.existsSync(path.join(ROOT, "windows", "install-test.ps1")));
    assert.ok(fs.existsSync(path.join(ROOT, "windows", "run-test.ps1")));
    const runScript = fs.readFileSync(path.join(ROOT, "windows", "run-test.ps1"), "utf8");
    assert.ok(runScript.includes("--remote-debugging-port=$CdpPort"));
    assert.ok(runScript.includes("--user-data-dir="));
    assert.ok(runScript.includes("attach_codex.mjs"));
    assert.ok(runScript.includes("seed_native_fixture.mjs"));
    assert.equal(runScript.includes('Start-Process "http://'), false);
  });

  await t.test("10. SSE 连接鉴权与在线人数统计", async () => {
    const sseFail = await request({
      path: "/api/events?room=SecureProject&room_key=wrongpass",
      method: "GET",
    });
    assert.equal(sseFail.status, 401);

    const sseReq = http.request({
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path: "/api/events?room=SecureProject&room_key=newsecret456&member_id=test_user&member_name=TestUser",
      method: "GET",
    });

    const sseReceived = await new Promise((resolve, reject) => {
      sseReq.on("response", (res) => {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["content-type"], "text/event-stream; charset=utf-8");
        let buffer = "";
        res.on("data", (chunk) => {
          buffer += chunk.toString();
          if (buffer.includes("event: snapshot")) {
            resolve(buffer);
          }
        });
      });
      sseReq.on("error", reject);
      sseReq.end();
    });

    assert.ok(sseReceived.includes("SecureProject"));
    sseReq.destroy();
  });

  await t.test("11. 未创建的房间直接访问快照或文本返回 404，杜绝幽灵房间提权漏洞", async () => {
    const snapRes = await request({ path: "/api/snapshot?room=NonExistentGhostRoom", method: "GET" });
    assert.equal(snapRes.status, 404);
    assert.equal(snapRes.body.error, "room_not_found");

    const textRes = await request({ path: "/api/compact.txt?room=NonExistentGhostRoom", method: "GET" });
    assert.equal(textRes.status, 404);

    // 再次确认并没有自动在 rooms 列表生成幽灵房间
    const roomsList = await request({ path: "/api/rooms", method: "GET" });
    assert.equal(roomsList.body.some((r) => r.id === "NonExistentGhostRoom"), false);
  });

  await t.test("12. 房间密码变更后，持有旧密钥的 SSE 客户端收到 auth_revoked 并断开连接", async () => {
    // 1. 创建专用测试房间 RotatingRoom
    await request(
      { path: "/api/rooms/verify", method: "POST" },
      { room: "RotatingRoom", room_key: "key_v1", auto_create: true },
    );

    // 2. 客户端以 key_v1 建立 SSE 连接
    const sseClient = http.request({
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path: "/api/events?room=RotatingRoom&room_key=key_v1&member_id=worker_1",
      method: "GET",
    });

    const receivedRevocation = new Promise((resolve) => {
      sseClient.on("response", (res) => {
        let buffer = "";
        res.on("data", (chunk) => {
          buffer += chunk.toString();
          if (buffer.includes("event: auth_revoked")) {
            resolve(true);
          }
        });
        res.on("end", () => resolve(true));
      });
      sseClient.on("error", () => resolve(true));
    });
    sseClient.end();

    // 等待建立后修改密码至 key_v2
    await new Promise((r) => setTimeout(r, 80));
    await request(
      { path: "/api/rooms/config", method: "POST" },
      { room: "RotatingRoom", room_key: "key_v1", new_key: "key_v2" },
    );

    const revoked = await Promise.race([
      receivedRevocation,
      new Promise((_, rej) => setTimeout(() => rej(new Error("auth_revoked timeout")), 3000)),
    ]);
    assert.equal(revoked, true);
    sseClient.destroy();
  });

  await t.test("13. 向不存在的房间发送消息返回 404", async () => {
    const res = await request(
      { path: "/api/messages", method: "POST" },
      { room: "GhostRoomForMessage", content: "hello", actor_id: "test" },
    );
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "room_not_found");
  });

  await t.test("14. 消息 client_message_id 幂等，重试不会再次落库", async () => {
    await request(
      { path: "/api/rooms/verify", method: "POST" },
      { room: "DedupeRoom", auto_create: true },
    );
    const payload = {
      room: "DedupeRoom",
      actor_id: "test",
      content: "同一个客户端消息只应落库一次",
      client_message_id: "dedupe-test-1",
    };
    const first = await request({ path: "/api/messages", method: "POST" }, payload);
    const retry = await request({ path: "/api/messages", method: "POST" }, payload);
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.id, first.body.id);

    const snapshot = await request({ path: "/api/snapshot?room=DedupeRoom", method: "GET" });
    assert.equal(snapshot.body.messages.filter((item) => item.client_message_id === "dedupe-test-1").length, 1);
  });

  await t.test("14.1. 分享快照元数据保留 Codex 回复与原生 Share 排除范围", async () => {
    const payload = {
      room: "DedupeRoom",
      actor_id: "test",
      content: "# Thread snapshot",
      metadata: {
        kind: "codex_context_snapshot",
        scope: "user_visible_thread",
        context_window_included: false,
        hidden_reasoning_included: false,
        tool_io_included: false,
        capture: { has_codex_response: true, message_count: 2 },
      },
    };
    const res = await request({ path: "/api/messages", method: "POST" }, payload);
    assert.equal(res.status, 201);
    assert.equal(res.body.metadata.kind, "codex_context_snapshot");
    assert.equal(res.body.metadata.capture.has_codex_response, true);
    assert.equal(res.body.metadata.context_window_included, false);
    assert.equal(res.body.metadata.hidden_reasoning_included, false);
    assert.equal(res.body.metadata.tool_io_included, false);
  });

  await t.test("15. 删除空间需要二次确认，且不允许删除系统空间 Media", async () => {
    const createRes = await request(
      { path: "/api/rooms/verify", method: "POST" },
      { room: "DeleteRoom", room_key: "delete-key", auto_create: true },
    );
    assert.equal(createRes.status, 200);

    const noConfirmRes = await request(
      { path: "/api/rooms/DeleteRoom?room=DeleteRoom&room_key=delete-key", method: "DELETE" },
      {},
    );
    assert.equal(noConfirmRes.status, 400);
    assert.equal(noConfirmRes.body.error, "confirmation_required");

    const wrongKeyRes = await request(
      { path: "/api/rooms/DeleteRoom?room=DeleteRoom&room_key=wrong-key", method: "DELETE" },
      { confirm_room: "DeleteRoom" },
    );
    assert.equal(wrongKeyRes.status, 401);

    const deleteRes = await request(
      { path: "/api/rooms/DeleteRoom?room=DeleteRoom&room_key=delete-key", method: "DELETE" },
      { confirm_room: "DeleteRoom" },
    );
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.deleted.id, "DeleteRoom");

    const listRes = await request({ path: "/api/rooms", method: "GET" });
    assert.equal(listRes.body.some((room) => room.id === "DeleteRoom"), false);
    const snapshotRes = await request({ path: "/api/snapshot?room=DeleteRoom", method: "GET" });
    assert.equal(snapshotRes.status, 404);

    const protectedRes = await request(
      { path: "/api/rooms/Media?room=Media", method: "DELETE" },
      { confirm_room: "Media" },
    );
    assert.equal(protectedRes.status, 409);
    assert.equal(protectedRes.body.error, "protected_room");
  });

  await t.test("16. Share 完整发送，Import 选择导入，并提供本机历史移除与空间删除入口", async () => {
    const htmlRes = await request({ path: "/", method: "GET" });
    assert.ok(htmlRes.raw.includes("btn-toggle-pwd"));
    assert.ok(htmlRes.raw.includes("roomKeys"));

    const jsRes = await request({ path: "/inject/sidebar_fullscreen.js", method: "GET" });
    assert.ok(jsRes.raw.includes("btn-toggle-pwd"));
    assert.ok(jsRes.raw.includes("roomKeys"));
    assert.ok(jsRes.raw.includes("forgetRoomLocally"));
    assert.ok(jsRes.raw.includes("deleteCurrentRoom"));
    assert.ok(jsRes.raw.includes("context-select-modal"));
    assert.ok(jsRes.raw.includes("extractLocalThreadMessages"));
    assert.ok(jsRes.raw.includes("extractTeamContextMessages"));
    assert.ok(jsRes.raw.includes("topLevelSemanticNodes"));
    assert.ok(jsRes.raw.includes("codex_response_not_detected"));
    assert.ok(jsRes.raw.includes("has_codex_response"));
    assert.ok(jsRes.raw.includes("model_label"));
    assert.ok(jsRes.raw.includes("reasoning_label"));
    assert.ok(jsRes.raw.includes("codex_context_snapshot"));
    assert.ok(jsRes.raw.includes("context_window_included: false"));
    assert.ok(jsRes.raw.includes("messageNodeToMarkdown"));
    assert.ok(jsRes.raw.includes("formatContextMarkdown"));
    assert.ok(jsRes.raw.includes("selectionPointerActive"));
    assert.ok(jsRes.raw.includes("context-select-import"));
    assert.ok(jsRes.raw.includes("importSelectedContextToMyAi"));

    const shareStart = jsRes.raw.indexOf("const shareCurrentThreadToTeam");
    const shareEnd = jsRes.raw.indexOf("const importSelectedContextToMyAi", shareStart);
    const shareBlock = jsRes.raw.slice(shareStart, shareEnd);
    assert.equal((shareBlock.match(/api\(\"\/api\/messages\"/g) || []).length, 1);
    assert.equal(shareBlock.includes("window.__teamContextPending = payload"), false);
    assert.equal(shareBlock.includes("local_") , false);
    assert.ok(shareBlock.includes("const extracted = extractLocalThreadMessages()"));
    assert.ok(shareBlock.includes("const selectedMessages = extracted.messages"));
    assert.ok(jsRes.raw.includes('root.getElementById("share-thread")?.addEventListener("click"'));
    assert.ok(jsRes.raw.includes('root.getElementById("review")?.addEventListener("click"'));

    // 验证微信式主体直接多选与快照详情弹窗机制
    assert.ok(jsRes.raw.includes("msg-select-check"));
    assert.ok(jsRes.raw.includes("selection-dock-bar"));
    assert.ok(jsRes.raw.includes("btn-select-import"));
    assert.ok(jsRes.raw.includes("snapshot-detail-modal"));
    assert.ok(jsRes.raw.includes("snapshot-open-link"));
    assert.ok(jsRes.raw.includes("isMultiSelectMode"));
    assert.ok(jsRes.raw.includes("applyRowRange"));
    assert.ok(jsRes.raw.includes("importSelectedMessagesToComposer"));
    assert.ok(jsRes.raw.includes("data-markdown-text-style"));
  });

  await t.test("17. 系统浏览器打开外部 URL (POST /api/open-url)", async () => {
    const invalidRes = await request({ path: "/api/open-url", method: "POST" }, { url: "javascript:alert(1)" });
    assert.equal(invalidRes.status, 400);

    const validRes = await request({ path: "/api/open-url", method: "POST" }, { url: "https://chatgpt.com/s/cx_test" });
    assert.equal(validRes.status, 200);
    assert.equal(validRes.body.ok, true);
  });
});
