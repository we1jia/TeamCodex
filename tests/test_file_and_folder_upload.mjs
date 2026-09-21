import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_PATH = path.join(ROOT, "server", "dev_host.mjs");
const TEST_PORT = 19888;

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const finalOptions = {
      hostname: "127.0.0.1",
      port: TEST_PORT,
      ...options,
    };
    const req = http.request(finalOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const bodyBuffer = Buffer.concat(chunks);
        const contentType = res.headers["content-type"] || "";
        let body = bodyBuffer.toString("utf8");
        if (contentType.includes("application/json")) {
          try {
            body = JSON.parse(body);
          } catch {}
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          rawBuffer: bodyBuffer,
        });
      });
    });
    req.on("error", reject);
    if (data) {
      if (typeof data === "string" || Buffer.isBuffer(data)) {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

test("通用文件上传与文件夹 ZIP 自动打包端到端实测", async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(ROOT, "data", "test-folder-upload-"));
  const env = { ...process.env, TEAM_CONTEXT_PORT: String(TEST_PORT), HOST: "127.0.0.1", TEAM_CONTEXT_DATA_DIR: tmpDataDir };
  const child = spawn("node", [SERVER_PATH], { env, stdio: "ignore" });

  try {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await request({ path: "/api/health", method: "GET" });
        if (res.statusCode === 200) {
          connected = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(connected, "测试服务需正常启动");

    // 1. 上传通用文档 (PDF / TXT)
    const textData = Buffer.from("Hello Team Codex Document").toString("base64");
    const uploadDocRes = await request(
      { path: "/api/upload", method: "POST", headers: { "Content-Type": "application/json" } },
      { filename: "spec.txt", data: textData }
    );
    assert.equal(uploadDocRes.statusCode, 201);
    assert.equal(uploadDocRes.body.ok, true);
    assert.equal(uploadDocRes.body.ext, ".txt");
    assert.equal(uploadDocRes.body.is_image, false);

    // 验证可通过 /uploads/* 读取
    const fetchDoc = await request({ path: uploadDocRes.body.url, method: "GET" });
    assert.equal(fetchDoc.statusCode, 200);
    assert.equal(fetchDoc.body, "Hello Team Codex Document");

    // 2. 上传文件夹打包为 ZIP
    const folderPayload = {
      folderName: "my_project_demo",
      files: [
        { path: "README.md", data: "# Demo Project\nThis is a test." },
        { path: "src/main.js", data: "console.log('running');" },
        { path: "config/app.json", data: JSON.stringify({ version: "1.0.0" }) },
      ],
    };
    const uploadFolderRes = await request(
      { path: "/api/upload-folder", method: "POST", headers: { "Content-Type": "application/json" } },
      folderPayload
    );
    assert.equal(uploadFolderRes.statusCode, 201);
    assert.equal(uploadFolderRes.body.ok, true);
    assert.equal(uploadFolderRes.body.folder_name, "my_project_demo");
    assert.equal(uploadFolderRes.body.file_count, 3);
    assert.ok(uploadFolderRes.body.filename.endsWith(".zip"));

    // 验证下载 ZIP 并校验内容
    const fetchZip = await request({ path: uploadFolderRes.body.url, method: "GET" });
    assert.equal(fetchZip.statusCode, 200);
    assert.equal(fetchZip.headers["content-type"], "application/zip");
    assert.ok(fetchZip.rawBuffer.length > 0);
  } finally {
    child.kill("SIGKILL");
    try {
      fs.rmSync(tmpDataDir, { recursive: true, force: true });
    } catch {}
  }
});

test("前端 sidebar_fullscreen.js 文件/文件夹上传与精简界面静态断言", () => {
  const content = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 1. 上传菜单与文件/文件夹 input 控件
  assert.match(content, /id="composer-upload-menu"/);
  assert.match(content, /id="menu-upload-image"/);
  assert.match(content, /id="menu-upload-file"/);
  assert.match(content, /id="menu-upload-folder"/);
  assert.match(content, /id="file-upload-file"/);
  assert.match(content, /id="file-upload-folder"/);
  assert.match(content, /webkitdirectory/);

  // 2. 消息气泡内文件/文件夹卡片
  assert.match(content, /class="msg-file-card"/);
  assert.match(content, /class="msg-file-icon"/);
  assert.match(content, /class="msg-file-name"/);

  // 3. 空状态精简化（无 empty-desc 冗余文本，间距 24px）
  assert.doesNotMatch(content, /<div class="empty-desc">/);
  assert.match(content, /margin-bottom:\s*24px/);

  // 4. 口令条等宽与文案精简
  assert.match(content, /id="collab-token-text">邀请口令<\/span>/);
  assert.match(content, /加入空间/);
  assert.match(content, /直接发送/);
});

