import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKSPACE = path.resolve(ROOT, "..");

test("1. attach_codex.mjs 修复验证与 target 识别", () => {
  const content = fs.readFileSync(path.join(ROOT, "inject/attach_codex.mjs"), "utf8");

  // 1.1 逗号笔误已修复：只删除内部 iframe，严禁拔除 #team-context-fullscreen-page 页面容器
  assert.doesNotMatch(content, /querySelectorAll\('#team-context-fullscreen-page,\s*iframe/);
  assert.match(content, /querySelectorAll\('#team-context-fullscreen-page iframe,\s*iframe\[src\*="127\.0\.0\.1:18765"\]'\)/);

  // 1.2 快照同步异常时不再强制 session.close() 引发级联断连重连
  assert.match(content, /catch\s*\(syncErr\)\s*\{\s*console\.warn\(`\[attach_codex\] snapshot\/sync failed/);
  assert.match(content, /return \{ installed: true, syncError: syncErr\.message \};/);

  // 1.3 彻底拔除 CDP 守护进程每 1.5 秒覆盖前端快照的死循环
  assert.doesNotMatch(content, /window\.__teamContextApply\s*&&\s*window\.__teamContextApply\(\$\{JSON\.stringify\(snap\)\}\)/);

  // 1.4 executeNativeRpc 支持前端目标 hubUrl 穿透
  assert.match(content, /hubUrl\s*=\s*null/);
  assert.match(content, /const hub = \(hubUrl \|\| HOST_URL\)\.replace/);

  // 1.5 getJson 与 postJson 具备 HTTPS 协议自适应能力，且同步消息优先使用目标 host
  assert.match(content, /const transport = fullUrl\.protocol === "https:" \? https : http/);
  assert.match(content, /const targetHost = \(state\.config\?\.hubUrl \|\| HOST_URL\)\.replace/);
  assert.match(content, /postJson\(`\$\{targetHost\}\/api\/messages`/);

  // 1.3 isCodexPage 同时支持 Codex 与 Windows ChatGPT 客户端
  const sandbox = { isCodexPage: null };
  const fnMatch = content.match(/function isCodexPage\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "应该提取到 isCodexPage 函数");
  vm.runInNewContext(`${fnMatch[0]}; isCodexPage = isCodexPage;`, sandbox);
  const { isCodexPage } = sandbox;

  assert.equal(isCodexPage({ type: "page", url: "app://main/index.html", title: "ChatGPT" }), true);
  assert.equal(isCodexPage({ type: "page", url: "https://chatgpt.com", title: "ChatGPT - Project" }), true);
  assert.equal(isCodexPage({ type: "page", url: "http://127.0.0.1:18765/windows/mock-codex-host.html", title: "Test" }), true);
  assert.equal(isCodexPage({ type: "page", url: "https://google.com", title: "Google" }), false);
  assert.equal(isCodexPage({ type: "service_worker", url: "app://main/sw.js" }), false);
  assert.equal(isCodexPage({ type: "page", url: "devtools://devtools/bundled/inspector.html" }), false);
});

test("2. sidebar_fullscreen.js 标题栏样式与拖拽死区修复", () => {
  const content = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 不再包含 148px 重复避让
  assert.doesNotMatch(content, /padding-right:\s*148px/);

  // .top 样式不再包含 -webkit-app-region: drag，确保顶部交互按钮点击 100% 灵敏响应
  const topBlockMatch = content.match(/\.top\s*\{([^}]+)\}/);
  assert.ok(topBlockMatch, "应该存在 .top 样式块");
  assert.doesNotMatch(topBlockMatch[1], /-webkit-app-region:\s*drag/);
});

test("3. sidebar_fullscreen.js loadConfig 运行时优先级与沙箱逻辑运行", () => {
  const code = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 提取 getDefaultConfig 与 loadConfig 并在沙箱中执行
  const mockLocalStorage = new Map();
  mockLocalStorage.set("team_context_config", JSON.stringify({
    hubUrl: "http://127.0.0.1:18765",
    roomId: "Media",
    nickname: "Tester",
  }));

  const sandbox = {
    window: {
      __TEAM_CONTEXT_HOST__: "http://10.211.55.2:18765",
      __TEAM_CONTEXT_DEFAULT_ROOM__: "1024",
      __TEAM_CONTEXT_DEFAULT_ROOM_KEY__: "123456",
    },
    localStorage: {
      getItem: (k) => mockLocalStorage.get(k) || null,
      setItem: (k, v) => mockLocalStorage.set(k, v),
    },
    document: { querySelector: () => null },
    STORAGE_KEY: "team_context_config",
  };

  const loadConfigSnippet = `
    function detectDeviceOS() { return "mac"; }
    function formatDeviceUser(n) { return { baseName: n, nickname: n + " (Mac)", memberId: n + "_mac" }; }
    function detectCurrentUserName() { return "Tester"; }
    function getDefaultConfig() {
      const defaultHost = (window.__TEAM_CONTEXT_HOST__ || "http://127.0.0.1:18765").replace(/\\/?\\?.*$/, "").replace(/\\/$/, "");
      return { hubUrl: defaultHost, roomId: "1024", roomKey: "123456", roomKeys: { "1024": "123456" }, nickname: "Tester (Mac)", memberId: "tester_mac", historyRooms: ["1024", "Media"], autoConnect: true };
    }
    ${code.match(/function loadConfig\(\)[\s\S]*?\n  \}/)[0]}
  `;

  vm.runInNewContext(`${loadConfigSnippet}; result = loadConfig();`, sandbox);
  assert.equal(sandbox.result.hubUrl, "http://10.211.55.2:18765", "运行时注入的 IP 应该成功覆盖 localStorage 中的默认 127.0.0.1");
  assert.equal(sandbox.result.roomId, "1024", "跨机场景或运行时默认空间应自动将遗留的 Media 升级为 1024");
  assert.equal(sandbox.result.roomKey, "123456", "空间 1024 应自动获得已知密钥 123456");
});

test("4. sidebar_fullscreen.js 侧边栏全菜单响应与Tab聚焦行为修复", () => {
  const code = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 4.1 离开监听器覆盖侧边栏所有原生菜单交互项（新对话、插件、定时任务、探索、Pull Request、设置等）
  assert.match(code, /target\.closest\('button,\s*a,\s*\[role="button"\],\s*\[role="tab"\],\s*\[data-app-action-sidebar-thread-id\],\s*nav li,\s*nav > div'\)/);
  assert.match(code, /window\.__teamContextClosePage\?\.\(\)/);

  // 4.2 open 函数在 existing 存在时保持页面并聚焦，禁止调用 returnToConversation()
  assert.match(code, /positionPage\(existing\);\s*setTabActive\(true\);/);
});

test("5. sidebar_fullscreen.js 直连超时与中继回调补全", () => {
  const code = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 5.1 超时放宽至 3500ms
  assert.match(code, /reject\(new Error\("直连超时 \(3500ms\)"\)\)\,\s*3500\)/);

  // 5.2 状态设置与错误提示
  assert.match(code, /connState\.status = "error"/);
  assert.match(code, /connectErrorBanner\.textContent = `协同服务连接受阻/);

  // 5.3 守护代理回调中拉取快照与设置 SSE
  assert.match(code, /\/\/ 补全守护代理中继回调：清空旧消息并拉取快照，启动长连接/);

  // 5.4 connectHub 优先走 callRpc 穿透跨域与 PNA 限制，并在 callRpc 中支持传递目标 hubUrl
  assert.match(code, /verifyData\s*=\s*await callRpc\("\/api\/rooms\/verify"/);
  assert.match(code, /hubUrl:\s*targetHub/);
});

test("6. Windows 脚本与快捷方式补齐及双路径自适应", () => {
  const runTestCmd = path.join(ROOT, "windows/run-test.cmd");
  assert.ok(fs.existsSync(runTestCmd), "windows/run-test.cmd 文件必须存在");
  const cmdContent = fs.readFileSync(runTestCmd, "utf8");
  assert.match(cmdContent, /run-test\.ps1/);
  assert.match(cmdContent, /windows\\run-test\.ps1/, "run-test.cmd 必须支持从根目录直接调用的路径回退");

  const installTestPs1 = path.join(ROOT, "windows/install-test.ps1");
  const installContent = fs.readFileSync(installTestPs1, "utf8");
  assert.match(installContent, /setup-runtime\.ps1/);

  // 检查所有 .ps1 的 UTF-8 BOM
  const ps1Files = ["install-teamcodex.ps1", "setup-runtime.ps1", "run-test.ps1", "install-test.ps1", "run-teamcodex.ps1"];
  for (const f of ps1Files) {
    const full = path.join(ROOT, "windows", f);
    const buf = fs.readFileSync(full);
    assert.equal(buf[0], 0xef, `${f} 必须有 UTF-8 BOM 首字节 0xEF`);
    assert.equal(buf[1], 0xbb, `${f} 必须有 UTF-8 BOM 次字节 0xBB`);
    assert.equal(buf[2], 0xbf, `${f} 必须有 UTF-8 BOM 尾字节 0xBF`);
  }

  // 检查启动测试模式.cmd 与 一键安装到桌面.cmd 的自适应路径
  const testCmd = fs.readFileSync(path.join(ROOT, "windows/启动测试模式.cmd"), "utf8");
  assert.match(testCmd, /windows\\run-test\.ps1/);

  const installCmd = fs.readFileSync(path.join(ROOT, "windows/一键安装到桌面.cmd"), "utf8");
  assert.match(installCmd, /windows\\install-teamcodex\.ps1/);
});

test("7. TeamCodex-Windows-arm64-amd64.zip 完整性与结构校验", async () => {
  const rootZip = path.join(ROOT, "TeamCodex-Windows-arm64-amd64.zip");
  const workspaceZip = path.join(WORKSPACE, "TeamCodex-Windows-arm64-amd64.zip");
  const zipPath = fs.existsSync(rootZip) ? rootZip : workspaceZip;
  assert.ok(fs.existsSync(zipPath), "ZIP 压缩包物理存在");

  const { execFileSync } = await import("node:child_process");
  const output = execFileSync("python3", ["-c", `
import zipfile, sys

with zipfile.ZipFile("${zipPath}", "r") as z:
    names = set(z.namelist())
    required = [
        "TeamCodex-Windows/一键安装到桌面.cmd",
        "TeamCodex-Windows/启动测试模式.cmd",
        "TeamCodex-Windows/启动TeamCodex.cmd",
        "TeamCodex-Windows/run-test.cmd",
        "TeamCodex-Windows/README.md",
        "TeamCodex-Windows/inject/attach_codex.mjs",
        "TeamCodex-Windows/inject/sidebar_fullscreen.js",
        "TeamCodex-Windows/windows/install-teamcodex.ps1",
        "TeamCodex-Windows/windows/setup-runtime.ps1",
        "TeamCodex-Windows/windows/run-test.ps1",
        "TeamCodex-Windows/data/hub_discovery.json"
    ]
    missing = [r for r in required if r not in names]
    if missing:
        print("MISSING:", missing)
        sys.exit(1)
    
    attach = z.read("TeamCodex-Windows/inject/attach_codex.mjs").decode("utf-8")
    assert "Codex|ChatGPT" in attach
    assert "#team-context-fullscreen-page iframe" in attach

    cmd = z.read("TeamCodex-Windows/run-test.cmd").decode("utf-8")
    assert "windows\\\\run-test.ps1" in cmd

    ps1 = z.read("TeamCodex-Windows/windows/setup-runtime.ps1")
    assert ps1[:3] == b"\\xef\\xbb\\xbf"
    print("ALL_ZIP_CHECKS_PASSED")
`], { encoding: "utf8" });

  assert.match(output, /ALL_ZIP_CHECKS_PASSED/);
});

test("8. UI_VERSION inline-v69+、内嵌标签删除图标、分享闭环、房间名防呆与黄金层级", () => {
  const code = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");
  assert.match(code, /const UI_VERSION = "inline-v(?:69|70|\d+)";/, "UI_VERSION 必须升级至 inline-v69 及以上");
  assert.match(code, /snapshot-detail-footer-info/, "分享弹窗底部必须包含独立的单行提示栏 snapshot-detail-footer-info");
  assert.match(code, /snapshot-detail-actions-right/, "分享弹窗底部必须包含右侧操作分栏");
  assert.match(code, /width:\s*min\(560px/, "弹窗卡片宽度必须扩展至 560px 杜绝挤压");
  assert.match(code, /return 38;/, "Windows 平台下必须硬性保底 38px 避让原生菜单栏");
  assert.match(code, /zIndex:\s*"35"/, "全屏容器 zIndex 必须设为 35，既压制原生拖拽header(30)，又绝不压制原生下拉菜单(50)");
  assert.match(code, /-webkit-app-region:\s*no-drag\s*!important/, ".top 必须声明 no-drag 杜绝 Windows 拖拽拦截");
  assert.match(code, /room-tag-chip-del/, "标签必须内嵌删除小图标支持一键移除");
  assert.match(code, /btn-send-share-to-room/, "分享弹窗必须提供直接发送到当前房间的闭环按钮");
  assert.match(code, /sanitizeRoomName/, "必须具备房间名防呆净化函数杜绝长URL污染");

  const runCodexPs1 = fs.readFileSync(path.join(ROOT, "windows/run-teamcodex.ps1"), "utf8");
  assert.match(runCodexPs1, /10\.211\.55\.2/, "run-teamcodex.ps1 必须包含 Mac 宿主机 IP 自动探测");
  assert.match(runCodexPs1, /成功发现 Mac 宿主机 TeamCodex 协同中枢/);
  assert.match(runCodexPs1, /Test-HubHealthFast[\s\S]*?500/, "run-teamcodex.ps1 宿主机健康探测单次超时缩短至 500ms 快速失败");
  assert.match(runCodexPs1, /\$retry\s*=\s*1;\s*\$retry\s*-le\s*1/, "run-teamcodex.ps1 采用 1 次快速重试杜绝阻塞");
});

test("9. sidebar_fullscreen.js parseCollabToken 智能口令解析与分拆填入", () => {
  const code = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 提取 parseCollabToken
  const fnMatch = code.match(/const parseCollabToken = \(([\s\S]*?)\n    \};/);
  assert.ok(fnMatch, "必须声明 parseCollabToken 函数");

  const sandbox = {
    window: { __TEAM_CONTEXT_HOST__: "http://10.211.55.2:18765" },
    URL,
    sanitizeRoomName: (s) => s.replace(/[\r\n\t]/g, "").slice(0, 30),
  };
  vm.runInNewContext(`var fn = ${fnMatch[0].replace(/const parseCollabToken\s*=\s*/, "")};`, sandbox);
  const parseCollabToken = sandbox.fn;

  // 1. 标准口令解析
  const res1 = parseCollabToken("Hub: http://192.168.1.100:18765 | Room: 1024 | Key: 123456");
  assert.ok(res1);
  assert.equal(res1.hubUrl, "http://192.168.1.100:18765");
  assert.equal(res1.roomId, "1024");
  assert.equal(res1.roomKey, "123456");

  // 2. 无 Key 口令解析
  const res2 = parseCollabToken("Hub: http://myhub.com:18765 | Room: Project-A");
  assert.ok(res2);
  assert.equal(res2.hubUrl, "http://myhub.com:18765");
  assert.equal(res2.roomId, "Project-A");
  assert.equal(res2.roomKey, "");

  // 3. 中文冒号与分隔符
  const res3 = parseCollabToken("服务：http://lan.local:18765 ｜ 空间：DesignTeam ｜ 密码：xyz");
  assert.ok(res3);
  assert.equal(res3.roomId, "DesignTeam");
  assert.equal(res3.roomKey, "xyz");

  // 4. 虚拟机智能转换：在已注入 10.211.55.2 时将口令中的 127.0.0.1 自动替换为宿主机 IP
  const res4 = parseCollabToken("Hub: http://127.0.0.1:18765 | Room: 1024 | Key: 666");
  assert.ok(res4);
  assert.equal(res4.hubUrl, "http://10.211.55.2:18765", "应该自动将 127.0.0.1 优化为宿主机 IP 10.211.55.2");
  assert.equal(res4.roomId, "1024");

  // 5. 非法口令返回 null
  assert.equal(parseCollabToken("普通聊天消息一段话"), null);

  // 6. UI 结构与输入框联动声明
  assert.match(code, /id="collab-token-bar"/, "必须包含口令横幅容器");
  assert.match(code, /id="btn-collab-token-join"/, "必须包含一键加入按钮");
  assert.match(code, /btnCopyCollabToken\?\.addEventListener/, "必须绑定复制邀请口令按钮");

  // 7. 口令横幅 CSS 隐蔽规则与空值状态/已在该空间/恢复逻辑
  assert.match(code, /\.collab-token-bar\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/, "CSS 必须强制 hidden 时 display: none !important");
  assert.match(code, /未检测到有效协同口令，请先在下方输入框粘贴口令/, "无口令时必须弹出友好提示而不是静默退出");
  assert.match(code, /showToast\("当前已在该空间中"\)/, "重复加入当前空间必须防呆提示");
  assert.match(code, /normalizeHub/, "必须对当前与目标 Hub 地址进行归一化比较杜绝 localhost 与 127.0.0.1 误判");
  assert.match(code, /backupInputValue/, "必须保存输入内容备份以防连接失败丢失");
  assert.match(code, /currentPendingCollabToken\s*=\s*backupPendingToken/, "连接失败时必须恢复口令栏状态");
});

test("10. windows/run-test.ps1 具备 Mac 宿主机自动探测与跨机协同测试模式", () => {
  const ps1Content = fs.readFileSync(path.join(ROOT, "windows/run-test.ps1"), "utf8");
  assert.match(ps1Content, /10\.211\.55\.2/, "run-test.ps1 必须包含 10.211.55.2 宿主机候选");
  assert.match(ps1Content, /成功发现 Mac 宿主机 TeamCodex 协同中枢/, "必须输出发现宿主机提示");
  assert.match(ps1Content, /\$targetHost = \$discoveredHost/, "发现宿主机后必须直接连接宿主机");
  assert.match(ps1Content, /-TimeoutSec\s+3/, "健康探测超时放宽至 3 秒");
  assert.match(ps1Content, /\$retry\s*=\s*1;\s*\$retry\s*-le\s*3/, "必须包含 3 次重试机制避免虚拟机网络冷启动延迟");
});

test("11. 在线人数统计多设备同名去重、SSE 动态追加成员与前端头像在线指示", () => {
  const hostCode = fs.readFileSync(path.join(ROOT, "server/dev_host.mjs"), "utf8");
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 11.1 在线人数按设备 memberId 去重：同一台 Mac 的 SSE+心跳只算 1 人，Mac/Win 仍算 2 人
  assert.match(hostCode, /const personKey = c\.memberId \|\| c\.clientId/);
  assert.match(hostCode, /people\.add\(String\(personKey\)\)/);

  // 11.2 SSE 动态追加非 anonymous 新成员并广播
  assert.match(hostCode, /memberId !== "anonymous" && !room\.members\.some/);
  assert.match(hostCode, /broadcastSnapshotToRoom\(room\.id\)/);

  // 11.3 前端头像与在线绿点指示（彻底剔除虚假 AI 角色，只展示真实在线协同设备）
  assert.match(uiCode, /\.stack-online-dot/, "必须定义 stack-online-dot 绿色圆点样式");
  assert.match(uiCode, /dot\.className = "stack-online-dot"/, "在线成员必须动态挂载在线绿点");
  assert.match(uiCode, /const realMembers = members\.filter/, "必须彻底剔除 codex/ai 虚拟角色");
  assert.match(uiCode, /\.row\.is-me, \.row\.outgoing \{ justify-content: flex-end; \}/, "本地发送消息必须靠右对齐");
  assert.match(uiCode, /\.row\.is-peer, \.row\.incoming \{ justify-content: flex-start; \}/, "对方接收消息必须靠左对齐");
  assert.match(uiCode, /snapshot-detail-native-import/, "快照详情弹窗必须包含一键导入到当前对话按钮");
});

test("12. 设备身份多端自动区分与前端多端独立头像渲染", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 12.1 提取 formatDeviceUser 并在沙箱中验证 Mac 与 Windows 差异
  const fnMatch = uiCode.match(/function formatDeviceUser\([\s\S]*?\n  \}/);
  assert.ok(fnMatch, "必须包含 formatDeviceUser 函数");

  const detectMatch = uiCode.match(/function detectDeviceOS\(\)[\s\S]*?\n  \}/);
  assert.ok(detectMatch, "必须包含 detectDeviceOS 函数");

  const macSandbox = {
    window: { __TEAM_CONTEXT_OS__: "darwin" },
    navigator: { platform: "MacIntel", userAgent: "Macintosh" },
    detectDeviceOS: null,
  };
  vm.runInNewContext(`${detectMatch[0]}; ${fnMatch[0]}; result = formatDeviceUser("weijia");`, macSandbox);
  assert.equal(macSandbox.result.nickname, "weijia (Mac)");
  assert.equal(macSandbox.result.memberId, "weijia_mac");

  const winSandbox = {
    window: { __TEAM_CONTEXT_OS__: "win32" },
    navigator: { platform: "Win32", userAgent: "Windows NT 10.0" },
    detectDeviceOS: null,
  };
  vm.runInNewContext(`${detectMatch[0]}; ${fnMatch[0]}; result = formatDeviceUser("weijia");`, winSandbox);
  assert.equal(winSandbox.result.nickname, "weijia (Win)");
  assert.equal(winSandbox.result.memberId, "weijia_win");

  // 12.2 重复后缀清洗转换
  vm.runInNewContext(`result = formatDeviceUser("weijia (Mac)");`, winSandbox);
  assert.equal(winSandbox.result.nickname, "weijia (Win)", "Windows 端从 Mac 复制昵称时应自动修正为 (Win)");
  assert.equal(winSandbox.result.memberId, "weijia_win");

  // 12.3 头像标牌与专属样式
  assert.match(uiCode, /\.stack-avatar\.is-mac/, "必须包含 Mac 节点头像样式");
  assert.match(uiCode, /\.stack-avatar\.is-win/, "必须包含 Win 节点头像样式");
  assert.match(uiCode, /badge\.className = `stack-device-badge \${isMac \? "badge-mac" : "badge-win"}`/);
  assert.match(uiCode, /badge\.textContent = isMac \? "M" : "W"/);

  // 12.4 气泡发言人优先展示 actor_name
  assert.match(uiCode, /who = message\.actor_name \|\| found\?\.name \|\| message\.actor_id/);
});

test("13. 服务端动态维护成员列表与 hub_discovery.json 共享通道发现", async () => {
  const hostCode = fs.readFileSync(path.join(ROOT, "server/dev_host.mjs"), "utf8");

  // 13.1 移除初始硬编码单人 liuweijia
  const defaultRoomMatch = hostCode.match(/function defaultRoom\([\s\S]*?\n\}/);
  assert.ok(defaultRoomMatch);
  assert.doesNotMatch(defaultRoomMatch[0], /\{ id: "liuweijia"/, "defaultRoom 必须移除硬编码单人 liuweijia");

  // 13.2 /api/messages 支持动态追加多端独立成员
  assert.match(hostCode, /if \(actorType === "human" && actorId && actorId !== "anonymous"\)/);
  assert.match(hostCode, /room\.members\.push\(\{[\s\S]*?id: actorId,[\s\S]*?name: actorName/);

  // 13.3 写入 hub_discovery.json 并在启动时调用
  assert.match(hostCode, /const DISCOVERY_FILE = path\.join\(DATA_DIR, "hub_discovery\.json"\)/);
  assert.match(hostCode, /writeHubDiscovery\(\);/);

  // 13.4 检查实际生成的文件内容
  const discPath = path.join(ROOT, "data/hub_discovery.json");
  assert.ok(fs.existsSync(discPath), "data/hub_discovery.json 必须物理存在");
  const disc = JSON.parse(fs.readFileSync(discPath, "utf8"));
  assert.match(disc.hub_url, /http:\/\/.*:18765/);
  assert.equal(disc.default_room, "1024");
  assert.equal(disc.known_keys?.["1024"], "123456");
});

test("14. Windows 脚本孤立进程强杀、优先读取共享发现与杜绝本地重复拉起 Hub", () => {
  const testPs1 = fs.readFileSync(path.join(ROOT, "windows/run-test.ps1"), "utf8");
  const codexPs1 = fs.readFileSync(path.join(ROOT, "windows/run-teamcodex.ps1"), "utf8");

  // 14.1 强杀 18765 和 19877 孤立 node.exe 进程
  assert.match(testPs1, /function Stop-OrphanNodeProcessesOnPorts/);
  assert.match(testPs1, /Stop-OrphanNodeProcessesOnPorts -Ports @\(18765, 19877\)/);
  assert.match(codexPs1, /Stop-OrphanNodeProcessesOnPorts -Ports @\(18765, 19877\)/);

  // 14.2 优先读取 data/hub_discovery.json
  assert.match(testPs1, /hub_discovery\.json/);
  assert.match(testPs1, /从共享通道读取中枢发现配置/);
  assert.match(codexPs1, /hub_discovery\.json/);
  assert.match(codexPs1, /从共享通道读取中枢发现配置/);

  // 14.3 探测宿主机成功即直接使用宿主机，坚决不在虚拟机本地启动单机 Hub
  assert.match(codexPs1, /if \(\$discoveredHost\) \{[\s\S]*?跳过本地单机 Hub 启动[\s\S]*?\} else \{/);
  assert.match(testPs1, /\$env:TEAM_CONTEXT_DEFAULT_ROOM = "1024"/);
  assert.match(testPs1, /\$env:TEAM_CONTEXT_DEFAULT_ROOM_KEY = \$discoveredRoomKey/);
  assert.match(codexPs1, /\$env:TEAM_CONTEXT_DEFAULT_ROOM = "1024"/);
  assert.match(codexPs1, /\$env:TEAM_CONTEXT_DEFAULT_ROOM_KEY = \$discoveredRoomKey/);
});

test("15. 房间 1024 密钥自动携带与 401 密钥自愈重试", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 15.1 默认配置自动预置 1024 密钥
  assert.match(uiCode, /"1024":\s*"123456"/);

  // 15.2 connectHub 遇到 401 时自动填充已知密钥自愈并重连
  assert.match(uiCode, /curRoom === "1024" \? "123456" : ""/);
  assert.match(uiCode, /尝试携带已知默认密钥自愈重连/);

  // 15.3 api() 遇到 401 时同样具备自愈重试机制
  assert.match(uiCode, /api 调用鉴权 401，尝试携带已知默认密钥自愈重试/);

  // 15.4 attach_codex.mjs 注入 DEFAULT_ROOM 与 DEFAULT_ROOM_KEY
  const attachCode = fs.readFileSync(path.join(ROOT, "inject/attach_codex.mjs"), "utf8");
  assert.match(attachCode, /window\.__TEAM_CONTEXT_DEFAULT_ROOM__=/);
  assert.match(attachCode, /window\.__TEAM_CONTEXT_DEFAULT_ROOM_KEY__=/);
});

test("16. isPageActive 活性判据与切回原生对话高亮无损互斥", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 16.1 必须定义并导出严格的 isPageActive 判据函数
  assert.match(uiCode, /function isPageActive\(\)\s*\{/);
  assert.match(uiCode, /page\.style\.display !== "none" && !page\.hidden && page\.style\.visibility !== "hidden"/);

  // 16.2 严禁在任何地方使用 !!document.getElementById(PAGE_ID) 作为 setTabActive 参数
  assert.doesNotMatch(uiCode, /setTabActive\(!!document\.getElementById\(PAGE_ID\)\)/);
  assert.match(uiCode, /setTabActive\(isPageActive\(\)\)/);

  // 16.3 closePage 与 setTabActive(false) 彻底清除 data-team-codex-open
  assert.match(uiCode, /function closePage\(\)\s*\{[\s\S]*?removeAttribute\("data-team-codex-open"\)/);
  assert.match(uiCode, /function setTabActive\(active\)[\s\S]*?removeAttribute\("data-team-codex-open"\)/);

  // 16.4 Tab 重新点击走 openPage 保证复位并恢复可见性
  assert.match(uiCode, /const open = \(event\) => \{[\s\S]*?window\.__teamContextOpenPage\?\.\(\);/);
});

test("17. windows/run-teamcodex.ps1 具备优雅退出与平滑接管防丢机制", () => {
  const psCode = fs.readFileSync(path.join(ROOT, "windows/run-teamcodex.ps1"), "utf8");

  // 17.1 必须定义并使用 Stop-ProcessGracefully
  assert.match(psCode, /function Stop-ProcessGracefully/);
  assert.match(psCode, /CloseMainWindow\(\)/, "必须通过发送 CloseMainWindow 优雅请求退出，保留草稿保存时间");

  // 17.2 检测到运行中但无端口时自动接管，严禁静默忽略或报错
  assert.match(psCode, /开始平滑接管：保存当前草稿并重启客户端/);
  assert.match(psCode, /Stop-ProcessGracefully -Processes \$running/);

  // 17.3 强制绑定 127.0.0.1 杜绝网络暴露
  assert.match(psCode, /"--remote-debugging-address=127\.0\.0\.1"/);
});

test("18. 彻底清理 AI 味图标与廉价表情，全面升级为原生精致矢量 SVG (inline-v71~v75)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 18.1 版本标识升级
  assert.match(uiCode, /const UI_VERSION = "inline-v(?:8[5-9]|9\d)";/);

  // 18.2 彻底根除代码模板与动态文本中的低质彩色 emoji 与全角特殊符号
  // 移除注释后检查有效代码
  const codeWithoutComments = uiCode.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(codeWithoutComments, /[✨🚀📥📤🍎🪟👁🔒✕]/u, "严禁在界面中出现廉价感彩色 emoji 或全角 ✕");

  // 18.3 弹窗主按钮升级为原生矢量 SVG 导入托盘图标与沉稳文案
  assert.match(uiCode, /id="snapshot-detail-native-import"/);
  assert.match(uiCode, /<span>导入到当前对话<\/span>/);

  // 18.4 弹窗关闭与外链升级为原生矢量 SVG
  assert.match(uiCode, /id="snapshot-detail-close"/);
  assert.match(uiCode, /id="snapshot-detail-native-open"/);

  // 18.5 空间口令快捷横幅与配置弹窗全面去除 ⚡ 与 🚀
  assert.match(uiCode, /id="collab-token-bar"/);
  assert.match(uiCode, /加入此空间/);
  assert.match(uiCode, /仅作为消息发送/);
  assert.doesNotMatch(uiCode, /🚀 一键加入此空间/);
  assert.doesNotMatch(uiCode, /⚡ 检测到协同口令/);
});

test("19. 精简输入框工具栏、多模式选会话分享与导入、磨砂毛玻璃样式 (inline-v72~v75)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 19.1 输入框底部工具栏拔除鸡肋按钮：不再存在 + New、@ Link、Secure
  const composerToolbarMatch = uiCode.match(/<div class="composer-toolbar">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(composerToolbarMatch, "应该找到 composer-toolbar 结构");
  const toolbarHtml = composerToolbarMatch[1];
  assert.doesNotMatch(toolbarHtml, /id="btn-new-thread"/, "工具栏严禁保留多余的 + New 按钮");
  assert.doesNotMatch(toolbarHtml, /id="mention"/, "工具栏严禁保留多余的 @ Link 按钮");
  assert.doesNotMatch(toolbarHtml, /class="safe-badge"/, "工具栏严禁保留占地的 Secure 标识");
  assert.match(toolbarHtml, /id="share-thread"/, "必须保留 [分享对话...]");
  assert.match(toolbarHtml, /id="review"/, "必须保留 [导入上下文]");

  // 19.2 移除浮层中的 dashed 虚线边框与突兀纯色加号方块
  assert.doesNotMatch(uiCode, /border:\s*1px dashed rgba\(58,\s*131,\s*247,\s*0\.3\)/);
  assert.doesNotMatch(uiCode, /border:\s*1px dashed var\(--accent-color\)/);
  assert.match(uiCode, /\.picker-item-action\s*\{\s*background:\s*var\(--bg-card/);

  // 19.3 快照详情弹窗具备清晰的三大导入操作与不折行样式
  assert.match(uiCode, /id="snapshot-detail-import-new"/, "必须具备 [新建并导入] 按钮");
  assert.match(uiCode, /id="snapshot-detail-native-import"/, "必须具备 [导入到当前对话] 按钮");
  assert.match(uiCode, /id="snapshot-detail-import-select"/, "必须具备 [选对话...] 按钮");
  assert.match(uiCode, /white-space:\s*nowrap\s*!important/, "弹窗按钮必须强制单行不折叠换行");
  assert.doesNotMatch(uiCode, /<span>\+\s*新建并导入<\/span>/, "严禁在文本中重复拼写加号产生双加号");

  // 19.4 多选 Dock 条精简收敛为单一明确的 [选择对话导入...]，彻底剔除冗余按钮与双加号
  assert.match(uiCode, /id="btn-select-import-select"/, "多选 Dock 条必须包含 [选择对话导入...]");
  assert.match(uiCode, /<span>选择对话导入\.\.\.<\/span>/, "多选 Dock 条导入按钮文案必须清晰明确");
  assert.doesNotMatch(uiCode, /id="btn-select-import-new"/, "多选 Dock 条必须剔除多余无用的单独新建并导入按钮");

  // 19.5 包含通用对话选择弹窗模态框 (thread-select-modal)
  assert.match(uiCode, /id="thread-select-modal"/, "必须包含通用选择对话模态框");
  assert.match(uiCode, /id="thread-select-search"/, "必须支持搜索过滤本地对话");
  assert.match(uiCode, /id="thread-select-list"/, "必须具备对话动态列表容器");

  // 19.6 自愈检测指纹已同步升级至 v77
  assert.match(uiCode, /existing\.dataset\.ui !== UI_VERSION/);
  assert.match(uiCode, /!existing\.shadowRoot\?\.getElementById\?\.\("snapshot-detail-import-new"\)/);
  assert.match(uiCode, /!existing\.shadowRoot\?\.getElementById\?\.\("thread-select-modal"\)/);

  // 19.7 具备独占防重锁与防多次狂点冲刷机制
  assert.match(uiCode, /let isImportingInProgress = false;/, "必须具备导入独占互斥锁");
  assert.match(uiCode, /if \(isImportingInProgress\) return;/, "进行中导入操作必须防重拦截");

  // 19.8 ProseMirror 编辑器注入具备合成剪贴板事件与生命周期侦听
  assert.match(uiCode, /new ClipboardEvent\("paste"/, "必须具备基于 DataTransfer 和 paste 事件的 ProseMirror 黄金注入方案");
  assert.match(uiCode, /expectedThreadId/, "跨会话切换注入必须等待目标会话挂载就绪");
  assert.match(uiCode, /isNewThread/, "新建会话导入必须侦听卸载并等待新编辑器挂载");
});

test("20. 尊重侧栏默认展开状态、项目归属提取、扁平分组与说明文案 (inline-v74/v75)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 20.1 严禁暴力自动展开侧栏目录，保持原生折叠完整性
  assert.doesNotMatch(uiCode, /expandAllSidebarFoldersAndMore/, "严禁对侧栏进行暴力自动展开");

  // 20.2 必须具备精准提取项目所属的 listSidebarThreadsDetailed
  assert.match(uiCode, /function listSidebarThreadsDetailed\(\)/);
  assert.match(uiCode, /const detectedProjects = folderEls\.map/);

  // 20.3 弹窗包含清晰沉浸的说明文案，提示仅显示当前展开的对话
  assert.match(uiCode, /id="thread-select-notice"/);
  assert.match(uiCode, /仅显示左侧栏当前已展开的对话/);
  assert.doesNotMatch(uiCode, /id="thread-select-rescan-btn"/, "不保留展开并刷新按钮");

  // 20.4 支持项目弱化分割头与项目微标样式
  assert.match(uiCode, /\.thread-select-group-header\s*\{/);
  assert.match(uiCode, /\.thread-select-item-project\s*\{/);

  // 20.5 搜索支持同时搜索对话标题与所属项目
  assert.match(uiCode, /t\.title\.toLowerCase\(\)\.includes\(q\) \|\| t\.project\.toLowerCase\(\)\.includes\(q\)/);
});

test("21. 对话选择列表纯展示容器规范、解绑整行点击与双击、空间常驻分享 (inline-v79)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 21.1 样式：.thread-select-item 为 default 光标并允许文字选择，彻底移除整行 hover 变色与联动
  assert.match(uiCode, /\.thread-select-item\s*\{[\s\S]*?cursor:\s*default;[\s\S]*?user-select:\s*text;/);
  assert.doesNotMatch(uiCode, /\.thread-select-item:hover\s*\.thread-select-item-action/);

  // 21.2 DOM：条目容器由 button 重构为 div，整行绝无 click/dblclick 绑定
  assert.match(uiCode, /const item = document\.createElement\("div"\);/);
  assert.match(uiCode, /item\.className = `thread-select-item/);
  assert.match(uiCode, /<button type="button" class="thread-select-item-action">/);

  // 21.3 事件唯一绑定在 actionBtn 上，绝不在 item 容器上监听 click
  assert.match(uiCode, /actionBtn\?\.addEventListener\("click"/);
  assert.doesNotMatch(uiCode, /item\.addEventListener\("click"/);
  assert.doesNotMatch(uiCode, /item\.addEventListener\("dblclick"/);

  // 21.4 分享模式下绝对不调用 closePage()，并在静默锁保护下完成空间内卡片上屏
  const shareBranchMatch = uiCode.match(/if\s*\(isShare\)\s*\{([\s\S]*?return;\s*\n\s*\})/);
  assert.ok(shareBranchMatch, "必须具备 isShare 分支");
  const shareBranch = shareBranchMatch[1];
  assert.doesNotMatch(shareBranch, /closePage\(\)/);
  assert.match(shareBranch, /window\.__teamContextSilentSwitch = true;/);
  assert.match(shareBranch, /window\.__teamContextSilentSwitch = false;/);

  // 21.5 原生分享链接等待超时收敛至 3200ms 并具备剪贴板重试
  assert.match(uiCode, /while\s*\(Date\.now\(\)\s*-\s*start\s*<\s*3200\)/);
  assert.match(uiCode, /for\s*\(let retry = 0;\s*retry < 4;\s*retry\+\+\)/);
});

test("22. 外链专属隔离、DOM就绪等待防漏读、短提问语境结构化杜绝孤立小写 n (inline-v80)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 22.1 彻底根除 extractLocalThreadMessages 从全局 document.body 嗅探外链的漏洞
  assert.doesNotMatch(uiCode, /docText\.match\(\/https:\\\/\\\/chatgpt\\\.com\\\/s\\\/cx_/);

  // 22.2 obtainNativeShareUrl 采用 threadShareUrlCache 专属隔离缓存，严禁盲取剪贴板历史残留
  assert.match(uiCode, /const threadShareUrlCache = new Map\(\);/);
  assert.doesNotMatch(uiCode, /const existing = await readClipboardSafe\(\);\s*if\s*\(existing\)\s*return existing;/);
  assert.match(uiCode, /threadShareUrlCache\.set\(threadKey,\s*generated\)/);

  // 22.3 具备基于文本指纹变更与节点数检测的 waitForThreadContentReady
  assert.match(uiCode, /const waitForThreadContentReady = async \(\) =>/);
  assert.match(uiCode, /before\.firstText !== current\.firstText/);

  // 22.4 renderMessage 中针对长度<=3的极短提问进行上下文结构化，彻底消灭孤立单字如 "n"
  assert.match(uiCode, /if \(previewText\.length <= 3\)/);
  assert.match(uiCode, /用户:\s*\$\{previewText\}\s*｜\s*回复:\s*\$\{replySnippet\}/);
});

test("23. 快照卡片底部操作按钮尺寸统一与微胶囊规范 (inline-v81)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 23.1 CSS：.snapshot-card-footer 采用 gap: 6px 规范
  assert.match(uiCode, /\.snapshot-card-footer\s*\{[\s\S]*?gap:\s*6px;/);

  // 23.2 CSS：.snapshot-open-link 统一锁定 24px 高度、内边距 0 8px、微胶囊边框与文字对齐
  assert.match(uiCode, /\.snapshot-open-link\s*\{[\s\S]*?height:\s*24px;/);
  assert.match(uiCode, /\.snapshot-open-link\s*\{[\s\S]*?padding:\s*0\s+8px;/);
  assert.match(uiCode, /\.snapshot-open-link\s*\{[\s\S]*?font-size:\s*11\.5px;/);
  assert.match(uiCode, /\.snapshot-open-link\s*\{[\s\S]*?box-sizing:\s*border-box;/);

  // 23.3 CSS：所有内部 SVG 图标强制 12x12
  assert.match(uiCode, /\.snapshot-open-link\s+svg\s*\{[\s\S]*?width:\s*12px;[\s\S]*?height:\s*12px;/);

  // 23.4 HTML 模板：严禁子按钮带脏内联 padding:0 或 font-size:inherit 污染
  assert.doesNotMatch(uiCode, /class="snapshot-open-link web-link"[^>]*style="[^"]*padding:\s*0/);
  assert.doesNotMatch(uiCode, /class="snapshot-open-link web-link"[^>]*style="[^"]*font-size:\s*inherit/);
  assert.doesNotMatch(uiCode, /class="snapshot-open-link card-copy-link"[^>]*style="[^"]*margin-right/);

  // 23.5 card-detail-link 补齐 12x12 矢量图标，杜绝无图标文字参差不齐
  assert.match(uiCode, /class="snapshot-open-link card-detail-link"[^>]*>[\s\S]*?<svg[\s\S]*?<span>查看详情<\/span>/);
});

test("24. 全量主题变量重构、紫色主题家族适配与弹窗/微胶囊无硬编码 (inline-v82)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 24.1 readHostThemeTokens 支持 purple 色彩家族识别，优先嗅探原生发送按钮
  assert.match(uiCode, /detectedFamily === "purple"/);
  assert.match(uiCode, /button\.bg-composer-primary/);

  // 24.2 对话选择模态框 (#thread-select-modal) 彻底接入主题变量
  assert.match(uiCode, /\.thread-select-search-wrap input:focus\s*\{[\s\S]*?border-color:\s*var\(--accent-color\);/);
  assert.match(uiCode, /\.thread-select-item\.is-current\s*\{[\s\S]*?var\(--accent-color\)/);
  assert.match(uiCode, /\.thread-select-notice svg\s*\{[\s\S]*?color:\s*var\(--accent-color\);/);
  assert.match(uiCode, /\.thread-select-item-action:hover:not\(:disabled\)\s*\{[\s\S]*?background:\s*var\(--accent-color\)\s*!important;/);

  // 24.3 快照详情原生弹窗 (#snapshot-detail-modal) 彻底根除纯黑硬编码，接入卡片与页面背景变量
  assert.match(uiCode, /\.snapshot-detail-card\s*\{[\s\S]*?background:\s*var\(--bg-page\);/);
  assert.match(uiCode, /\.snapshot-native-preview-card\s*\{[\s\S]*?background:\s*var\(--bg-card\);/);
  assert.match(uiCode, /\.snapshot-detail-footer\s*\{[\s\S]*?background:\s*var\(--bg-page\);/);
  assert.match(uiCode, /\.snapshot-detail-native-import-btn\s*\{[\s\S]*?background:\s*var\(--accent-color\);/);
  assert.match(uiCode, /\.snapshot-detail-native-copy-btn\s*\{[\s\S]*?background:\s*var\(--bg-chip\);/);
  assert.doesNotMatch(uiCode, /rgba\(33,\s*33,\s*33/);
  assert.doesNotMatch(uiCode, /#171717/);

  // 24.4 官方原生分享徽章与状态提示统一绑定 var(--accent-color)
  assert.match(uiCode, /<span style="color:var\(--accent-color\);font-weight:600;">官方原生分享<\/span>/);
  assert.match(uiCode, /cfgHubStatus\.style\.color\s*=\s*"var\(--accent-color\)";/);

  // 24.5 微胶囊辅助按钮高对比度自然跟随
  assert.match(uiCode, /\.snapshot-open-link\s*\{[\s\S]*?color:\s*var\(--text-secondary\);[\s\S]*?background:\s*var\(--bg-chip\);/);
  assert.match(uiCode, /\.snapshot-open-link:hover\s*\{[\s\S]*?background:\s*var\(--bg-card-hover\);/);
});

test("25. 详情弹窗支持展开完整会话内容与外链状态自适应 (inline-v83)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 25.1 具备可折叠的上下文对话区结构与 DOM 引用
  assert.match(uiCode, /id="snapshot-detail-context-toggle"/);
  assert.match(uiCode, /id="snapshot-detail-full-content"/);
  assert.match(uiCode, /const snapshotDetailContextToggle = root\.getElementById\("snapshot-detail-context-toggle"\);/);
  assert.match(uiCode, /const snapshotDetailFullContent = root\.getElementById\("snapshot-detail-full-content"\);/);

  // 25.2 openSnapshotDetailModal 填充 full_markdown 并默认收起
  assert.match(uiCode, /snapshotDetailFullContent\.textContent = fullText;/);
  assert.match(uiCode, /snapshotDetailFullContent\.hidden = true;/);

  // 25.3 根据是否具备 shareUrl 进行外链自适应展示与文案切换
  assert.match(uiCode, /snapshotDetailNativeOpen\.style\.display = "none";/);
  assert.match(uiCode, /snapshotDetailFooterNote\.textContent = "当前为团队本地数据快照，已完整保存至本空间";/);

  // 25.4 具备点击展开/收起切换逻辑
  assert.match(uiCode, /snapshotDetailContextToggle\?\.addEventListener\("click"/);
  assert.match(uiCode, /snapshotDetailFullContent\.hidden = !isHidden;/);
});

test("26. 严格提纯发送消息 payload，彻底根除 DOM 元素循环引用导致的 JSON 序列化崩溃 (inline-v84)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 26.1 版本标识升级至 inline-v84+
  assert.match(uiCode, /const UI_VERSION = "inline-v(?:8[4-9]|9\d)";/);

  // 26.2 listSidebarThreadsDetailed 彻底移除 element: el，仅返回纯数据
  assert.match(uiCode, /return\s*\{\s*id,\s*title,\s*selected,\s*project\s*\};/);
  assert.doesNotMatch(uiCode, /return\s*\{\s*id,\s*title,\s*selected,\s*project,\s*element:\s*el\s*\};/);

  // 26.3 triggerSidebarThreadClick 解除对 thread.element 的依赖，改用 title 安全兜底
  assert.doesNotMatch(uiCode, /if \(!target && thread\.element\) \{\s*target = thread\.element;\s*\}/);
  assert.match(uiCode, /if \(!target && thread\.title\)/);

  // 26.4 submitCurrentMessage 中具备严格提纯的 safeLinkedThread 逻辑
  assert.match(uiCode, /const safeLinkedThread = threadInfo \? \{/);
  assert.match(uiCode, /id: String\(threadInfo\.id/);
  assert.match(uiCode, /title: String\(threadInfo\.title/);
  assert.match(uiCode, /linked_thread:\s*safeLinkedThread,/);
});

test("27. 成员头像栏全量接入背景色切割环、双重留白光环与设备微图标 (inline-v85)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 27.1 版本标识升级至 inline-v85+
  assert.match(uiCode, /const UI_VERSION = "inline-v(?:8[5-9]|9\d)";/);

  // 27.2 彻底消灭 --bg-body 与 #18181b 纯黑硬编码描边，全量使用 var(--bg-page)
  assert.doesNotMatch(uiCode, /var\(--bg-body/);
  assert.match(uiCode, /\.stack-avatar\s*\{[\s\S]*?box-shadow:\s*0\s+0\s+0\s+2px\s+var\(--bg-page\);/);
  assert.match(uiCode, /\.stack-online-dot\s*\{[\s\S]*?box-shadow:\s*0\s+0\s+0\s+1\.5px\s+var\(--bg-page\);/);

  // 27.3 激活状态具备双重留白光环 (Ring-offset)
  assert.match(uiCode, /\.stack-avatar\.is-active\s*\{[\s\S]*?box-shadow:\s*0\s+0\s+0\s+1\.5px\s+var\(--bg-page\),\s*0\s+0\s+0\s+3px\s+var\(--accent-color\);/);

  // 27.4 设备节点支持精致微矢量 SVG 渲染
  assert.match(uiCode, /if \(isMac\) \{\s*avatarBtn\.innerHTML\s*=\s*`<svg viewBox="0 0 24 24"/);
  assert.match(uiCode, /else if \(isWin\) \{\s*avatarBtn\.innerHTML\s*=\s*`<svg viewBox="0 0 24 24"/);

  // 27.5 邀请加号按钮升级为微胶囊并具备平滑 hover
  assert.match(uiCode, /\.stack-invite-btn\s*\{[\s\S]*?background:\s*var\(--bg-chip\);/);
});

test("28. Windows→Mac 实时接收不得只依赖跨域 EventSource message 事件 (inline-v86+)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");
  const hostCode = fs.readFileSync(path.join(ROOT, "server/dev_host.mjs"), "utf8");
  const attachCode = fs.readFileSync(path.join(ROOT, "inject/attach_codex.mjs"), "utf8");

  // 28.1 版本升级
  assert.match(uiCode, /const UI_VERSION = "inline-v(?:8[89]|9\d)";/);

  // 28.2 发送走 Node RPC，接收必须有同通道快照轮询兜底，避免 Mac EventSource 静默丢包
  assert.match(uiCode, /const startSnapshotPoll = /);
  assert.match(uiCode, /const stopSnapshotPoll = /);
  assert.match(uiCode, /const pollSnapshotOnce = /);
  assert.match(uiCode, /startSnapshotPoll\(\)/);
  assert.match(uiCode, /stopSnapshotPoll\(\)/);
  assert.match(uiCode, /setInterval\(\(\) => \{ pollSnapshotOnce\(\); \}, 2000\)/);
  assert.match(uiCode, /const snap = await api\("\/api\/snapshot"\)/);

  // 28.3 SSE 同时监听 chat 与默认 message，并绑定 onmessage，规避 Chromium 事件名碰撞
  assert.match(uiCode, /addEventListener\("chat"/);
  assert.match(uiCode, /sseSource\.onmessage\s*=/);
  assert.match(hostCode, /broadcastToRoom\(room\.id, "chat", message\)/);
  assert.match(hostCode, /broadcastToRoom\(room\.id, "message", message\)/);

  // 28.4 EventSource 必须在 bridge iframe 同 Realm 内创建，再 postMessage 回页面
  assert.match(uiCode, /__tcSse/);
  assert.match(uiCode, /parent\.postMessage/);
  assert.match(uiCode, /contentDocument/);

  // 28.5 收发房间回退值统一，禁止 SSE 默认 Media、发送默认 1024
  assert.match(uiCode, /const defaultRoomId = \(\) =>/);
  assert.doesNotMatch(uiCode, /room: config\.roomId \|\| "1024"/);
  assert.doesNotMatch(uiCode, /params = new URLSearchParams\(\{[\s\S]*?room: config\.roomId \|\| "Media"/);

  // 28.6 isMe 不得把裸 weijia / liu weijia 一律当成当前 Mac 自己，避免把 Win 消息画成自己或直接滤掉
  assert.doesNotMatch(uiCode, /senderId === "liuweijia" \|\| senderId === "weijia" \|\| senderName === "liu weijia"/);

  // 28.7 服务端落库前提纯 linked_thread，双端旧客户端即使仍夹带 DOM 字段也不会污染广播
  assert.match(hostCode, /function sanitizeLinkedThread/);
  assert.match(hostCode, /linked_thread: sanitizeLinkedThread\(body\.linked_thread\)/);

  // 28.8 快照卡片不得引用未定义 snapMarkdown，单条渲染失败不得中断后续消息
  assert.match(uiCode, /const snapMarkdown = String\(message\.metadata\?\.full_markdown \|\| contentText \|\| ""\)/);
  assert.match(uiCode, /try \{ renderMessage\(msg\); \} catch/);

  // 28.9 Node 守护循环按页面 hubUrl 投递增量消息，接收与发送走同一条 CDP 通道
  assert.match(uiCode, /window\.__teamContextIngestMessages = /);
  assert.match(uiCode, /lastSeq: Number\(lastSnapshot\?\.seq \|\| 0\)/);
  assert.match(attachCode, /__teamContextIngestMessages/);
  assert.match(attachCode, /\/api\/snapshot\?room=/);
  assert.match(attachCode, /Number\(cfg\.lastSeq \|\| 0\)/);
  assert.match(uiCode, /startSnapshotPoll\(\);/);
});

test("29. 历史空间标签允许移除 Media，删除图标跟随主题色而非硬编码红 (inline-v89)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  assert.match(uiCode, /const UI_VERSION = "inline-v(?:89|9\d)";/);

  // 29.1 本地历史记录允许移除 Media，不再把系统空间排除在标签删除之外
  assert.doesNotMatch(uiCode, /if \(!cleanRoom \|\| cleanRoom === "Media"\) return false;/);
  assert.doesNotMatch(uiCode, /系统默认主空间 Media 不可删除/);
  assert.doesNotMatch(uiCode, /系统主空间 Media 不允许删除，自建空间内嵌删除图标/);
  assert.doesNotMatch(uiCode, /if \(r !== "Media"\) \{\s*const delBtn/);

  // 29.2 删除当前空间时不得写死切回 Media，应按剩余历史回退
  assert.doesNotMatch(uiCode, /if \(r === config\.roomId\) \{\s*switchRoom\("Media"\);/);

  // 29.3 删除图标使用当前标签文字色，严禁硬编码红
  assert.match(uiCode, /\.room-tag-chip-del\s*\{[\s\S]*?color:\s*inherit;/);
  assert.doesNotMatch(uiCode, /\.room-tag-chip-del:hover\s*\{[^}]*#ef4444/);
  assert.match(uiCode, /\.room-tag-chip-del:hover\s*\{[\s\S]*?color:\s*inherit;/);
});

test("30. 邀请口令进房必须登记在线心跳，快速切换能解析口令 (inline-v90)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");
  const hostCode = fs.readFileSync(path.join(ROOT, "server/dev_host.mjs"), "utf8");
  const attachCode = fs.readFileSync(path.join(ROOT, "inject/attach_codex.mjs"), "utf8");

  assert.match(uiCode, /const UI_VERSION = "inline-v9[0-9]";/);

  // 30.1 快照请求携带 member_id / client_id，服务端按心跳统计在线
  assert.match(uiCode, /member_id=\$\{encodeURIComponent/);
  assert.match(uiCode, /client_id=\$\{encodeURIComponent/);
  assert.match(hostCode, /function touchPresence/);
  assert.match(hostCode, /function getRoomActiveMembers/);
  assert.match(hostCode, /PRESENCE_TTL_MS/);
  assert.match(hostCode, /touchPresence\(\{/);

  // 30.2 快速切换输入框粘贴邀请口令时必须解析 room/key，而不是把整段口令当房间名
  assert.match(uiCode, /const switchRoom = \(roomId\) => \{[\s\S]*?parseCollabToken/);

  // 30.3 verify 进房时带上当前设备身份
  assert.match(uiCode, /member_id: config\.memberId/);
  assert.match(uiCode, /member_name: config\.nickname/);

  // 30.4 空房间 lastSeq=0 时守护进程仍要拉快照做心跳，不能跳过
  assert.doesNotMatch(attachCode, /if \(lastSeq > 0\) \{\s*const snap = await getJson/);
  assert.match(attachCode, /member_id=\$\{encodeURIComponent\(cfg\.memberId/);
});

test("31. 房间弹层底部操作改为纵向菜单，在线人数按 memberId 去重 (inline-v91)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");
  const hostCode = fs.readFileSync(path.join(ROOT, "server/dev_host.mjs"), "utf8");

  assert.match(uiCode, /const UI_VERSION = "inline-v9[1-9]";/);

  // 31.1 底部三个操作不得挤在一行 space-between，改为纵向全宽菜单
  assert.match(uiCode, /\.popover-footer\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.doesNotMatch(uiCode, /\.popover-footer\s*\{[^}]*justify-content:\s*space-between/);
  assert.match(uiCode, /\.popover-link-btn\s*\{[\s\S]*?width:\s*100%/);
  assert.doesNotMatch(uiCode, /\.popover-link-btn\.danger:hover \{ color: #ef4444; \}/);

  // 31.2 同一 memberId 的多个 clientId 不得把 1 台设备计成多人
  assert.match(hostCode, /people\.add\(String\(item\.memberId \|\| item\.clientId\)\)/);
});

test("32. 托盘控制面、Hub 热更新注入与安装包更新检查", () => {
  const attach = fs.readFileSync(path.join(ROOT, "inject/attach_codex.mjs"), "utf8");
  const launcher = fs.readFileSync(path.join(ROOT, "server/launcher_host.mjs"), "utf8");
  const panel = fs.readFileSync(path.join(ROOT, "ui/panel.html"), "utf8");
  const launchSh = fs.readFileSync(path.join(ROOT, "macos/launch.sh"), "utf8");
  const runPs = fs.readFileSync(path.join(ROOT, "windows/run-teamcodex.ps1"), "utf8");
  const swift = fs.readFileSync(path.join(ROOT, "macos/TeamCodex.swift"), "utf8");

  assert.ok(fs.existsSync(path.join(ROOT, "windows/tray-teamcodex.ps1")));
  assert.ok(fs.existsSync(path.join(ROOT, "version.json")));
  assert.match(attach, /async function resolveInjectScript/);
  assert.match(attach, /\/inject\/sidebar_fullscreen\.js/);
  assert.match(attach, /function injectSource\(script\)/);
  assert.match(attach, /querySelectorAll\('#team-context-fullscreen-page iframe,\s*iframe\[src\*="127\.0\.0\.1:18765"\]'\)/);
  assert.match(launcher, /\/api\/status/);
  assert.match(launcher, /\/api\/token/);
  assert.match(launcher, /\/api\/update/);
  assert.match(launcher, /api\.github\.com\/repos\/\$\{GITHUB_REPO\}\/releases\/latest/);
  assert.match(panel, /启动并挂载 Codex/);
  assert.match(panel, /复制协同口令/);
  assert.match(panel, /立即更新/);
  assert.match(launchSh, /launcher_host\.mjs/);
  assert.match(runPs, /tray-teamcodex\.ps1/);
  assert.match(runPs, /launcher_host\.mjs/);
  assert.match(swift, /NSStatusItem/);
  assert.match(swift, /127\.0\.0\.1:18767\/panel\.html/);

  // 32.2 Windows 托盘左键原生弹窗与右键原版菜单闭环
  const trayPs = fs.readFileSync(path.join(ROOT, "windows/tray-teamcodex.ps1"), "utf8");
  assert.match(trayPs, /Toggle-PanelPopup/, "托盘必须支持左键点击唤起专属控制面板弹窗");
  assert.match(trayPs, /\$popup\.FormBorderStyle\s*=\s*\[System\.Windows\.Forms\.FormBorderStyle\]::None/);
  assert.match(trayPs, /\$notify\.ContextMenuStrip\s*=\s*\$menu/, "右键保持上下文菜单");
  assert.match(trayPs, /\$exitItem = \$menu\.Items\.Add\("退出"\)/, "右键菜单必须具备原版退出");
  assert.doesNotMatch(trayPs, /打开控制面板 \(Mini Dashboard\)/, "右键菜单不得包含多余的重复打开控制面板项");
});

test("33. 侧栏 Tab 按钮与全屏顶部 Brand 全量升级为简称 Team (inline-v92+)", () => {
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 33.1 UI_VERSION 升级至 inline-v92+
  assert.match(uiCode, /const UI_VERSION = "inline-v9[2-9]";/);

  // 33.2 侧边栏 Tab 按钮文本与 aria-label 简化为 Team
  assert.match(uiCode, /button\.setAttribute\("aria-label",\s*"Team"\);/);
  assert.match(uiCode, /node\.textContent\s*=\s*"Team";/);
  assert.match(uiCode, /tab:\s*"Team"/);

  // 33.3 全屏协作顶部 Brand 标题简化为 Team
  assert.match(uiCode, /<h1 style="[^"]*">Team<\/h1>/);
});

test("34. Mac 首次启动注入健壮性、白瓷姿态高清图标与主界面更新检测闭环 (inline-v93)", () => {
  const attachCode = fs.readFileSync(path.join(ROOT, "inject/attach_codex.mjs"), "utf8");
  const launcherCode = fs.readFileSync(path.join(ROOT, "server/launcher_host.mjs"), "utf8");
  const uiCode = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");

  // 34.1 Mac 启动注入健壮性：open -n -a 独立实例、100次等待、Header 安全编码
  assert.match(attachCode, /open/);
  assert.match(attachCode, /attempts = 100/);
  assert.match(attachCode, /encodeURIComponent\(strVal\)/);
  assert.match(launcherCode, /findActiveCdpPort/);

  // 34.2 协作主界面更新检测卡片与小圆点
  assert.match(uiCode, /btn-check-update/);
  assert.match(uiCode, /doCheckUpdate/);
  assert.match(uiCode, /update-dot/);

  // 34.3 macOS 纯白瓷姿态高清图标与 DMG 存在性
  const icnsPath = path.join(ROOT, "macos/TeamCodex.app/Contents/Resources/AppIcon.icns");
  const dmgPath = path.join(ROOT, "TeamCodex-macOS.dmg");
  assert.ok(fs.existsSync(icnsPath), "AppIcon.icns 应存在");
  if (fs.existsSync(dmgPath)) {
    assert.ok(fs.statSync(dmgPath).size > 1000000, "若存在 DMG 则大小应大于 1MB");
  }
});

test("35. macOS 菜单栏状态图标升级为微矢量纯白双云协同图标 (TeamCodex-Status)，自适应 Template 规范并彻底替换简陋剪影", () => {
  const swiftCode = fs.readFileSync(path.join(ROOT, "macos/TeamCodex.swift"), "utf8");

  // 35.1 彻底替换简陋的 SF Symbol person.2.fill
  assert.doesNotMatch(swiftCode, /person\.2\.fill.*accessibilityDescription/, "严禁在状态栏继续使用简陋的两个小人剪影");

  // 35.2 状态栏图标资源存在并符合规范尺寸
  const status1x = path.join(ROOT, "macos/TeamCodex-Status.png");
  const status2x = path.join(ROOT, "macos/TeamCodex-Status@2x.png");
  const appRes1x = path.join(ROOT, "macos/TeamCodex.app/Contents/Resources/TeamCodex-Status.png");
  const appRes2x = path.join(ROOT, "macos/TeamCodex.app/Contents/Resources/TeamCodex-Status@2x.png");

  assert.ok(fs.existsSync(status1x), "TeamCodex-Status.png 应存在");
  assert.ok(fs.existsSync(status2x), "TeamCodex-Status@2x.png 应存在");
  assert.ok(fs.existsSync(appRes1x), "App Bundle 根资源中应包含 TeamCodex-Status.png");
  assert.ok(fs.existsSync(appRes2x), "App Bundle 根资源中应包含 TeamCodex-Status@2x.png");

  // 35.3 Swift 代码必须正确设置 isTemplate = true 以自适应浅色/深色系统主题
  assert.match(swiftCode, /createStatusIcon/);
  assert.match(swiftCode, /isTemplate\s*=\s*true/);
  assert.match(swiftCode, /TeamCodex-Status/);
});

test("36. 官方 Codex 插件体系整合、元数据规范、Hook 自动注入与 Plugin Zip 校验", () => {
  // 36.1 验证 .codex-plugin/plugin.json
  const pluginJsonPath = path.join(ROOT, ".codex-plugin/plugin.json");
  assert.ok(fs.existsSync(pluginJsonPath), ".codex-plugin/plugin.json 应存在");
  const manifest = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
  assert.strictEqual(manifest.name, "team-codex");
  assert.strictEqual(manifest.version, "1.1.5");
  assert.ok(manifest.skills && manifest.skills.includes("skills/team-codex/"));
  assert.ok(manifest.hooks && manifest.hooks.includes("hooks/hooks.json"));
  assert.ok(manifest.interface && manifest.interface.defaultPrompt.length >= 3);

  // 36.2 验证 Hook 脚本及权限
  const hookJsonPath = path.join(ROOT, "hooks/hooks.json");
  const hookScriptPath = path.join(ROOT, "hooks/user_prompt_submit.mjs");
  assert.ok(fs.existsSync(hookJsonPath), "hooks/hooks.json 应存在");
  assert.ok(fs.existsSync(hookScriptPath), "hooks/user_prompt_submit.mjs 应存在");
  const hookScript = fs.readFileSync(hookScriptPath, "utf8");
  assert.match(hookScript, /compact\.txt/);
  assert.match(hookScript, /timeout:\s*1200/);

  // 36.3 验证 Skill 与文档插图
  const skillPath = path.join(ROOT, "skills/team-codex/SKILL.md");
  const screenshotDoc = path.join(ROOT, "docs/assets/codex_plugin_detail.png");
  assert.ok(fs.existsSync(skillPath), "skills/team-codex/SKILL.md 应存在");
  assert.ok(fs.existsSync(screenshotDoc), "docs/assets/codex_plugin_detail.png 应存在");
  assert.ok(fs.statSync(screenshotDoc).size > 50000, "插件详情截图应大于 50KB");

  // 36.4 验证 TeamCodex-Codex-Plugin.zip 压缩包完整性
  const pluginZipPath = path.join(ROOT, "TeamCodex-Codex-Plugin.zip");
  if (fs.existsSync(pluginZipPath)) {
    assert.ok(fs.statSync(pluginZipPath).size > 100000, "插件压缩包应大于 100KB");
  }
});

test("37. 通用代理安全决策、热挂载优先与无端口防盲杀机制 (inline-v94)", () => {
  const launcherCode = fs.readFileSync(path.join(ROOT, "server/launcher_host.mjs"), "utf8");
  const panelCode = fs.readFileSync(path.join(ROOT, "ui/panel.html"), "utf8");
  const runPs = fs.readFileSync(path.join(ROOT, "windows/run-teamcodex.ps1"), "utf8");

  // 37.1 启动器必须包含通用进程检测与代理特征抽象，禁止写死特定厂商
  assert.match(launcherCode, /function isCodexRunning/);
  assert.match(launcherCode, /function hasCustomProxyConfig/);
  assert.doesNotMatch(launcherCode, /isCockpitManaged/, "严禁将外部代理机制特化绑定到单一工具名");

  // 37.2 启动器热挂载优先与受控优雅重启
  assert.match(launcherCode, /mode:\s*"attached"/);
  assert.match(launcherCode, /requires_restart_confirm/);
  assert.match(launcherCode, /has_custom_proxy/);

  // 37.3 前端 panel 界面具备受控确认与防丢失提示
  assert.match(panelCode, /requires_restart_confirm/);
  assert.match(panelCode, /confirm\(tip\)/);
  assert.match(panelCode, /force:\s*true/);

  // 37.4 Windows 脚本具备动态嗅探运行中实例 CDP 端口
  assert.match(runPs, /detectedCdpPort/);
  assert.match(runPs, /--remote-debugging-port=\(\\d\+\)/);
});

test("38. 全平台自动化一键打包流水线可用性与四大分发包完整性", () => {
  const buildAllScript = path.join(ROOT, "scripts/build_all.py");
  assert.ok(fs.existsSync(buildAllScript), "scripts/build_all.py 一键打包脚本应存在");

  const buildAllCode = fs.readFileSync(buildAllScript, "utf8");
  assert.match(buildAllCode, /build_mac_zip\.py/);
  assert.match(buildAllCode, /build_dmg\.py/);
  assert.match(buildAllCode, /build_zip\.py/);
  assert.match(buildAllCode, /build_plugin_zip\.py/);

  // 验证打包产物是否存在且具备有效体积
  const artifacts = [
    { file: "TeamCodex-macOS.zip", minSize: 1000000 },
    { file: "TeamCodex-macOS.dmg", minSize: 1500000 },
    { file: "TeamCodex-Windows-arm64-amd64.zip", minSize: 200000 },
    { file: "TeamCodex-Codex-Plugin.zip", minSize: 1000000 },
  ];

  for (const { file, minSize } of artifacts) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      assert.ok(fs.statSync(fullPath).size >= minSize, `${file} 大小应大于 ${minSize} 字节`);
    }
  }
});

test("39. v1.1.5 Windows 托盘秒级先行 (Instant Tray)、单实例防抖互斥、移除强杀进程与稳健消息泵", () => {
  const runPs = fs.readFileSync(path.join(ROOT, "windows/run-teamcodex.ps1"), "utf8");
  const trayPs = fs.readFileSync(path.join(ROOT, "windows/tray-teamcodex.ps1"), "utf8");
  const versionJson = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
  const pluginJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex-plugin/plugin.json"), "utf8"));
  const launcherHost = fs.readFileSync(path.join(ROOT, "server/launcher_host.mjs"), "utf8");
  const installerNsi = fs.readFileSync(path.join(ROOT, "windows/installer.nsi"), "utf8");

  // 39.1 版本全量同步至 1.1.5
  assert.strictEqual(versionJson.version, "1.1.5", "version.json 版本必须为 1.1.5");
  assert.strictEqual(pluginJson.version, "1.1.5", "plugin.json 版本必须为 1.1.5");
  assert.match(launcherHost, /return String\(v\.version \|\| "1\.1\.5"\);/, "launcher_host.mjs fallback 版本必须为 1.1.5");
  assert.match(installerNsi, /DisplayVersion"\s+"1\.1\.5"/, "installer.nsi DisplayVersion 必须为 1.1.5");
  assert.match(trayPs, /当前版本 1\.1\.5/, "tray-teamcodex.ps1 右键菜单必须显示当前版本 1.1.5");
  assert.match(trayPs, /v1\.1\.5/, "tray-teamcodex.ps1 悬浮面板标题必须显示 v1.1.5");

  // 39.2 启动链路秒级先行：托盘先行拉起且先于耗时操作
  const instantTrayIdx = runPs.indexOf("Start-Process -FilePath \"powershell.exe\" -ArgumentList @(\"-STA\", \"-NoProfile\", \"-ExecutionPolicy\", \"Bypass\", \"-WindowStyle\", \"Hidden\", \"-File\", \"`\"$trayScript`\"\"");
  const runtimeEnsureIdx = runPs.indexOf("Ensure-TeamCodexRuntime");
  const hostProbeIdx = runPs.indexOf("Test-HubHealthFast");
  assert.ok(instantTrayIdx > 0, "run-teamcodex.ps1 必须在启动初期瞬间拉起托盘进程");
  assert.ok(instantTrayIdx < runtimeEnsureIdx, "托盘拉起必须严格优先于 Node 运行时环境解压与检查");
  assert.ok(instantTrayIdx < hostProbeIdx, "托盘拉起必须严格优先于宿主机网络探测");

  // 39.3 单实例互斥防抖机制：绝不互相强杀已运行进程
  assert.match(runPs, /Local\\TeamCodexAppMutex/, "run-teamcodex.ps1 必须引入 Local\\TeamCodexAppMutex 互斥体");
  assert.match(runPs, /\/api\/wake/, "run-teamcodex.ps1 检测到已有实例必须触发 /api/wake 唤醒");
  assert.doesNotMatch(runPs, /Stop-Process -Id \$_\\.ProcessId -Force -ErrorAction SilentlyContinue[\s\S]*?tray-teamcodex/, "run-teamcodex.ps1 严禁强杀正在运行中的托盘 powershell 实例");

  // 39.4 稳固托盘消息泵：拆除 finally 强杀逻辑
  assert.doesNotMatch(trayPs, /finally\s*\{\s*&\s*\$doExit\s*\}/, "tray-teamcodex.ps1 必须彻底拆除 finally { & $doExit } 强杀逻辑");
  assert.match(trayPs, /\$exitItem\.Add_Click\(\$doExit\)/, "必须且仅在点击退出菜单项时执行 $doExit");
  assert.match(trayPs, /ShowBalloonTip\(2000,\s*"TeamCodex",\s*"TeamCodex 协同套件已就绪/, "托盘必须在拉起时第一时间弹出就绪反馈气泡");

  // 39.5 网络嗅探快速失败：500ms 超时与 1 次重试
  assert.match(runPs, /Test-HubHealthFast[\s\S]*?TimeoutMs = 500/, "单次超时必须缩短至 500ms");
  assert.match(runPs, /\$retry\s*=\s*1;\s*\$retry\s*-le\s*1/, "探测重试次数必须缩短为 1 次，快速失败转入单机模式");
});




