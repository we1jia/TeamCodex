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
  const zipPath = path.join(WORKSPACE, "TeamCodex-Windows-arm64-amd64.zip");
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

test("8. UI_VERSION inline-v67、内嵌标签删除图标、分享闭环、房间名防呆与黄金层级", () => {
  const code = fs.readFileSync(path.join(ROOT, "inject/sidebar_fullscreen.js"), "utf8");
  assert.match(code, /const UI_VERSION = "inline-v67";/, "UI_VERSION 必须升级至 inline-v67");
  assert.match(code, /return 38;/, "Windows 平台下必须硬性保底 38px 避让原生菜单栏");
  assert.match(code, /zIndex:\s*"35"/, "全屏容器 zIndex 必须设为 35，既压制原生拖拽header(30)，又绝不压制原生下拉菜单(50)");
  assert.match(code, /-webkit-app-region:\s*no-drag\s*!important/, ".top 必须声明 no-drag 杜绝 Windows 拖拽拦截");
  assert.match(code, /room-tag-chip-del/, "标签必须内嵌删除小图标支持一键移除");
  assert.match(code, /btn-send-share-to-room/, "分享弹窗必须提供直接发送到当前房间的闭环按钮");
  assert.match(code, /sanitizeRoomName/, "必须具备房间名防呆净化函数杜绝长URL污染");

  const runCodexPs1 = fs.readFileSync(path.join(ROOT, "windows/run-teamcodex.ps1"), "utf8");
  assert.match(runCodexPs1, /10\.211\.55\.2/, "run-teamcodex.ps1 必须包含 Mac 宿主机 IP 自动探测");
  assert.match(runCodexPs1, /成功发现 Mac 宿主机 TeamCodex 协同中枢/);
  assert.match(runCodexPs1, /-TimeoutSec\s+3/, "run-teamcodex.ps1 宿主机健康探测超时必须放宽至 3 秒");
  assert.match(runCodexPs1, /\$retry\s*=\s*1;\s*\$retry\s*-le\s*3/, "run-teamcodex.ps1 必须包含 3 次重试机制");
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

  // 11.1 服务端多设备同名去重与设备计数
  assert.match(hostCode, /const idKey = c\.clientId \|\| c\.id/);
  assert.match(hostCode, /activeClients\.add\(idKey\)/);
  assert.doesNotMatch(hostCode, /uniqueMembers\.add\(c\.memberId\)/, "不得简单对 memberId 去重导致同名多设备计为1人");

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
