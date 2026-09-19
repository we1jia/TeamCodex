import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const ROOT = path.resolve(import.meta.dirname, "..");
const HUB_PORT = 18765;

// 辅助网络请求函数
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
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

test("1. 后端 dev_host.mjs 图片上传与静态文件托管能力", async () => {
  const hostContent = fs.readFileSync(path.join(ROOT, "server/dev_host.mjs"), "utf8");

  // 1.1 静态 MIME 扩展覆盖主流图片格式
  assert.match(hostContent, /"\.png":\s*"image\/png"/);
  assert.match(hostContent, /"\.jpg":\s*"image\/jpeg"/);
  assert.match(hostContent, /"\.jpeg":\s*"image\/jpeg"/);
  assert.match(hostContent, /"\.webp":\s*"image\/webp"/);
  assert.match(hostContent, /"\.gif":\s*"image\/gif"/);

  // 1.2 静态路由支持 /uploads/* 并支持 GET 与 HEAD 请求
  assert.match(hostContent, /url\.pathname\.startsWith\("\/uploads\/"\)/);
  assert.match(hostContent, /req\.method === "GET" \|\| req\.method === "HEAD"/);

  // 1.3 存在 POST /api/upload 处理逻辑并设有限制
  assert.match(hostContent, /url\.pathname === "\/api\/upload"/);
  assert.match(hostContent, /10 \* 1024 \* 1024/);

  // 1.4 POST /api/messages 支持纯图片自动设置 content = "[图片]"
  assert.match(hostContent, /const hasImages = Array\.isArray\(body\.metadata\?\.images\)/);
  assert.match(hostContent, /content = "\[图片\]"/);
});

test("2. 端到端实测：POST /api/upload 上传与 GET /uploads/* 获取", async () => {
  // 生成一个标准的 1x1 透明 PNG 图片 Base64
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const pngBuffer = Buffer.from(pngBase64, "base64");

  // 2.1 成功上传 PNG 图片
  const uploadRes = await request(
    {
      hostname: "127.0.0.1",
      port: HUB_PORT,
      path: "/api/upload",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      filename: "test_pixel.png",
      base64: pngBase64,
    }
  );

  assert.equal(uploadRes.statusCode, 201, `上传应返回 201，当前状态码: ${uploadRes.statusCode}`);
  assert.equal(uploadRes.body.ok, true);
  assert.ok(uploadRes.body.url.startsWith("/uploads/img_"));
  assert.ok(uploadRes.body.full_url.includes(uploadRes.body.url));
  assert.equal(uploadRes.body.size, pngBuffer.length);
  assert.equal(uploadRes.body.ext, ".png");

  // 2.2 验证文件确实已在本地落盘
  const savedFilename = path.basename(uploadRes.body.url);
  const localSavedPath = path.join(ROOT, "data/uploads", savedFilename);
  assert.ok(fs.existsSync(localSavedPath), `文件应存在于本地: ${localSavedPath}`);

  // 2.3 通过静态路由 GET /uploads/* 下载并比对内容
  const getRes = await request({
    hostname: "127.0.0.1",
    port: HUB_PORT,
    path: uploadRes.body.url,
    method: "GET",
  });

  assert.equal(getRes.statusCode, 200, "静态文件获取应返回 200");
  assert.equal(getRes.headers["content-type"], "image/png");
  assert.equal(getRes.rawBuffer.length, pngBuffer.length);
  assert.deepEqual(getRes.rawBuffer, pngBuffer);

  // 2.4 测试 HEAD 请求支持
  const headRes = await request({
    hostname: "127.0.0.1",
    port: HUB_PORT,
    path: uploadRes.body.url,
    method: "HEAD",
  });
  assert.equal(headRes.statusCode, 200, "HEAD 请求应返回 200");
  assert.equal(headRes.headers["content-type"], "image/png");

  // 2.5 异常测试：空数据上传应返回 400
  const badRes = await request(
    {
      hostname: "127.0.0.1",
      port: HUB_PORT,
      path: "/api/upload",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {}
  );
  assert.equal(badRes.statusCode, 400);

  // 2.6 异常测试：超大图片（超过 10MB）应返回 413
  const hugeData = Buffer.alloc(11 * 1024 * 1024, 0).toString("base64");
  const hugeRes = await request(
    {
      hostname: "127.0.0.1",
      port: HUB_PORT,
      path: "/api/upload",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { filename: "huge.png", base64: hugeData }
  );
  assert.equal(hugeRes.statusCode, 413, "超过 10MB 应返回 413");
});

test("3. 消息广播与发送集成：支持纯图片与文字+图片消息", async () => {
  // 3.1 纯图片消息发送（无 content）
  const sendImgRes = await request(
    {
      hostname: "127.0.0.1",
      port: HUB_PORT,
      path: "/api/messages?room=Media",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      actor_id: "test_mac",
      actor_name: "Mac 测试员",
      metadata: {
        images: [
          {
            url: "/uploads/img_test.png",
            full_url: "http://127.0.0.1:18765/uploads/img_test.png",
            name: "test.png",
            size: 1024,
          },
        ],
      },
    }
  );

  assert.equal(sendImgRes.statusCode, 201);
  assert.equal(sendImgRes.body.content, "[图片]");
  assert.equal(sendImgRes.body.metadata.images.length, 1);
  assert.equal(sendImgRes.body.metadata.images[0].url, "/uploads/img_test.png");

  // 3.2 图文结合消息发送
  const sendMixedRes = await request(
    {
      hostname: "127.0.0.1",
      port: HUB_PORT,
      path: "/api/messages?room=Media",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      content: "请看附带的架构设计图：",
      actor_id: "test_win",
      actor_name: "Win 测试员",
      metadata: {
        images: [
          {
            url: "/uploads/arch.png",
            name: "arch.png",
            size: 2048,
          },
        ],
      },
    }
  );

  assert.equal(sendMixedRes.statusCode, 201);
  assert.equal(sendMixedRes.body.content, "请看附带的架构设计图：");
  assert.equal(sendMixedRes.body.metadata.images.length, 1);
});

test("4. 前端 sidebar_fullscreen.js 完整交互闭环断言", () => {
  const content = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 4.1 DOM 结构注入：待发预览条、上传文件控件与 Lightbox 模态框
  assert.match(content, /id="composer-image-preview-bar"/);
  assert.match(content, /id="composer-image-chip"/);
  assert.match(content, /id="btn-upload-image"/);
  assert.match(content, /id="file-upload-image"/);
  assert.match(content, /id="image-lightbox-modal"/);
  assert.match(content, /id="image-lightbox-img"/);

  // 4.2 核心剪贴板粘贴截图拦截与拖拽支持
  assert.match(content, /event\.clipboardData\?\.items/);
  assert.match(content, /items\[i\]\.type\.indexOf\("image"\) !== -1/);
  assert.match(content, /items\[i\]\.getAsFile\(\)/);
  assert.match(content, /input\.addEventListener\("dragover"/);
  assert.match(content, /input\.addEventListener\("drop"/);

  // 4.3 消息渲染挂载图片卡片与点击唤起 Lightbox
  assert.match(content, /class="msg-image-wrap"/);
  assert.match(content, /class="msg-chat-image"/);
  assert.match(content, /openImageLightbox\(src\)/);

  // 4.4 发送逻辑自动上传待发图片并清空状态
  assert.match(content, /const currentPendingImg = pendingImage/);
  assert.match(content, /api\("\/api\/upload"/);
  assert.match(content, /setPendingImage\(null\)/);

  // 4.5 跨机 LAN IP 与 Hub 路由穿透自适应
  assert.match(content, /function resolveImageUrl|const resolveImageUrl =/);
  assert.match(content, /config\.hubUrl \|\| window\.__TEAM_CONTEXT_HOST__/);
});
