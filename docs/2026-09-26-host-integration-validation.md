# 新版宿主适配验收记录

日期：2026-09-26（Asia/Shanghai）。2026-09-27 最新状态：Mac 本机安装版已自行启动并收到 `inline-v104` 的真实挂载回执；入口点击和 Windows 实机仍待验收，未发布。下文各阶段的“未安装”是当时状态，以文末运行态记录为准。

## 改动范围

- `inject/host_adapter.mjs`：新 rail / 旧 sidebar 能力探测、准确入口和主区域边界；未知或多候选结构拒绝挂载。
- `inject/sidebar_fullscreen.js`：`inline-v104`；新版图标入口、标题栏保留、窗口控件与侧栏折叠不触发离开、重建监听、菜单定位和鼠标点击竞态修复。未知布局收起已有页面但不删除草稿或编辑 DOM，恢复后不自动抢回页面。
- `inject/attach_codex.mjs`、`server/workspace_bundle.mjs`：共用前置探测和浏览器适配器；旧远端脚本不包含适配器时使用本地整包。
- Mac DMG/ZIP、Windows ZIP/NSIS 清单包含新运行时模块。
- 未新增 MCP Apps 服务、Hub API、权限、消息协议、账号或共享数据写入。

## 自动化结果

### Node：123 pass / 0 fail / 1 skip（含截图反馈后的冷启动回归）

```sh
node --test --test-reporter=tap \
  tests/test_host_adapter.mjs tests/test_host_layout.mjs \
  tests/test_mount_recovery.mjs tests/test_team_navigation.mjs \
  tests/test_workspace_bridge.mjs tests/test_room_rpc.mjs \
  tests/test_runtime_adapters.mjs tests/test_runtime_integration.mjs \
  tests/test_runtime_policy.mjs tests/test_discussion_appearance.mjs \
  tests/test_workspace_typography.mjs tests/test_composer_appearance.mjs \
  tests/test_attach_shutdown.mjs tests/test_workspace_dialog.mjs \
  tests/test_safety.mjs tests/test_workspace.mjs tests/test_workspace_http.mjs \
  tests/test_launcher_lifecycle.mjs tests/test_launch_recovery.mjs \
  tests/test_picker_interaction.mjs
```

涵盖新旧布局、Mac/Windows 条件、100/125/150% CSS 坐标、标题栏/右侧/底部边界、折叠、隐藏/inert、未知结构、重建、离开与未保存保护、原生 RPC 去重、隔离 HTTP/启动生命周期。缩放和平台用 DOM/平台参数替身，不是 Windows 原生显示缩放实测。

跳过项：`tests/test_launcher_lifecycle.mjs` 的 macOS 原生环境读取测试，需要 `TEAM_CODEX_CONTEXT_READER` 指定的原生组件；本轮未配置或运行它。

### 打包逻辑：18 pass

```sh
python3 -m unittest discover -s tests -p 'test_*packaging.py' -q
```

验证文件清单、版本一致性、隔离数据、发布保护。原生编译工具使用 mock，不能据此宣称已构建或安装可运行的 DMG/EXE。自动发布测试仅对临时目录的 Git bare 仓库运行，其中预期的 push rejection 是测试用例；未推送真实项目远端。

`node --check` 已通过 adapter、sidebar、attach；`git diff --check` 通过。

## 浏览器交互验证

运行 `node tests/host_layout_preview.mjs`，绑定随机 loopback 端口。完整加载生产 sidebar/workspace 脚本，所有 Hub 调用使用内存替身；CSP 禁止外部连接和 iframe。不是对真实 Codex 的 CDP 验收。

| 场景 | 观察结果 |
|---|---|
| 新版 Mac 模拟入口 | rail 中只有一个 Team 图标，菜单紧贴 rail（left=60），保留四个模块入口 |
| 悬停后点击 Team | 菜单保持打开，不再反向关闭 |
| 新版主区域 | 展开 left=296 / top=44；折叠 left=56 / top=44 |
| 展开/折叠、rail 克隆重建 | 页面仍显示，草稿不丢，重建后恢复一个入口 |
| install 连续调用 20 次 | 入口数量保持 1，页面和草稿保留 |
| 原生窗口控件替身 | 点击成功，不关闭 Team；新版标题栏未隐藏 |
| 原生新聊天 → Team | 离开时隐藏 Team，主动返回后草稿仍在 |
| 移除 main 模拟未知布局 | 页面收起、草稿保留、openPage 返回 false；恢复结构后不会自动打开 |
| 新版 Windows 分支 | `data-platform=windows`；展开/折叠与标题栏避让正确、窗口控件可点击、草稿保留 |
| 旧版 Mac 分支 | 文字入口；展开 left=240 / top=0，折叠 left=0，草稿保留 |
| 旧版 Windows 分支 | 文字入口；展开 left=240 / top=38，折叠 left=0 / top=38，草稿保留，沿用旧版标题栏安全兜底 |

上述已记录场景 `fixtureErrors=[]`。未发送团队消息、未上传、未分享真实会话。

知识库入口在无成员凭证时正常显示身份启用页；未执行身份注册。知识库/素材库/看板的编辑流程由现有隔离单元与 HTTP 测试覆盖，本轮浏览器不将其记作真实成员业务 E2E。测试中有一次悬停未触发（指针已在按钮上）、折叠后旧元素引用失效以及身份页重绘后引用脱离 DOM，均在只读检查页面后修正测试动作；与已复现并修复的菜单 hover/click 竞态区分记录。

本次查看过的隔离截图（临时文件，明确标注非真实宿主）：

- `teamcodex-host-layout-macos-isolated.png`（本机临时截图，未纳入仓库）
- `teamcodex-host-layout-windows-isolated.png`（本机临时截图，未纳入仓库）

## 实机与发布门禁

- Mac 安装版本元数据与包内 DOM 标记已只读核对，但当前宿主访问被 Computer Use 安全限制阻止；未改用其他工具绕过，未由助手开启调试端口或重启客户端。用户后续自行打开应用后，已只读检查 TeamCodex 写出的日志和状态文件，发现实际冷启动缺陷，详见下方补充。
- 未采集 Windows 实际安装版本或真实 DOM；未验收原生窗口控件、DPI/系统缩放、安装/卸载、升级和实际跨设备通信。
- 未验证所有 Chat/Work/Codex 表面。当前 DOM 是实现细节，官方升级仍可能需要适配；不能按本轮测试承诺永久兼容。
- 发布前需在获准的测试环境分别验收两端：新旧布局、折叠/缩放/最大化、热重建、编辑未保存离开保护、分享/导入与消息流程，以及安装包升级。客户端访问限制未解除时不能用绕行方式补测。
- 当前仅工作区修改；未提交、推送、发布、安装或重启用户客户端。
- 验收后已关闭本轮 Agent TaskSpace，并停止隔离夹具服务；用户 X 工作窗口未接管。守卫仍显示原有 `about:blank` 浏览器外壳，没有为清理再创建工作空间。

## 后续截图反馈：等待挂载确认

- 用户提供 `codex-clipboard-5829a2e9-0167-481f-aa77-81a031d8fb57.png`，TeamCodex v1.2.6 中枢/房间绿灯，Codex 黄色“已打开，等待挂载确认”，未显示 Team 入口。
- 2026-09-26 16:32:49（Asia/Shanghai）读取安装版 `data/attach-state.json`：`installed:false`、`state:waiting_page`、`uiVersion:""`。启动器工作目录为 `/Applications/TeamCodex.app/Contents/Resources/app`。
- 安装版 `data/attach.log` 持续出现 `Cannot read properties of null (reading 'roomId')`。这是真实运行故障，不能拿助手的 Computer Use 访问限制来解释用户按钮没有效果。
- 根因之一已复现：`__teamContextGetConfig` 在 `mountCollab` 内初始化，讨论页首次打开前合法返回 `null`；`resolveRoomContext(config = {})` 的默认参数不覆盖显式 `null`，因此异常发生在读取挂载结果之前。该问题在工作区新版中也遗留，不是仅替换布局代码就能证明解决。
- 新增四个回归用例在修改前全部失败，原有三个 room RPC 用例通过。修复后：冷启动不消费消息/RPC 队列、不访问默认房间，独立返回真实入口挂载结果；入口缺失仍返回 `installed:false`，不伪报成功。null 参数有防御性保护。
- 已修复范围仅为工作区 `inject/attach_codex.mjs` 和对应测试。完整 Node 回归为 123 pass / 0 fail / 1 skip；语法、diff 检查通过。此前打包回归 18 项结论只覆盖打包逻辑，不是安装验收。
- 已安装应用未替换、未重启；没有连接受限客户端读取实时 DOM。该空值错误能解释错误回执，但并不证明它是 Team 入口缺失的唯一原因；新版布局和冷启动修复仍需一起做获准的实机验收。

## 后续离线原生构建

2026-09-26 已用真实 `swiftc` 编译 macOS arm64 测试包，未运行应用或修改已安装副本：

- 文件：`TeamCodex-macOS-layout-fix-test.zip`（本机临时测试包，约 2.1 MB，未纳入仓库）。
- SHA-256：`cff300403ca31de187bf0df89d684ec4091612a39dbbdc054e2318dd8d34476a`。
- 原生编译成功，ad-hoc 签名严格验证通过，ZIP 完整性验证通过。
- 包内三项修改后的注入文件与工作区逐字节一致，包内 JS 语法检查通过；未包含运行数据和本机启动配置。
- 保持版本元数据 1.2.6、UI inline-v104，以文件名明确为未发布测试构建；未做公证，不是正式发布包。
- 这是原生构建证据的补充，不是实际安装或客户端挂载证据。尚未恢复用户当前已安装应用。

## 用户授权后的本机安装更新

用户明确要求“更新电脑里已安装的这个，然后我自己打开运行”。据此只更新 TeamCodex，不启动它，不操作受限的 GPT/Codex 客户端。

- 目标：`/Applications/TeamCodex.app`。
- 旧版完整备份：本机 `Library/Application Support/TeamCodex/backups/` 下的带时间戳目录，未纳入分发包。
- 使用本机 TeamCodex 自带 shutdown 接口停止其控制面和注入器，随后结束其状态栏进程。共享 Hub（PID 32819）保留，没有停止或重启 GPT/Codex。
- 将已验证测试构建合并更新到原安装目录，原 data 目录不替换。29 个运行时文件与测试包逐字节一致；Mach-O 签名区之前的可执行内容与测试构建一致。因保留 data 后重新签名，签名区变化属预期，完整二进制并非逐字节相同。
- 更新前备份、原目录 data 内容一致；更新后 5 个数据文件、633484 字节的集合哈希保持一致。未删除消息、上传、房间配置或工作区数据。
- `inline-v104` 和冷启动 `config ??= {}` 均已在安装目录核对；包内脚本语法检查通过，重新本地 ad-hoc 签名后严格验证通过。
- 外层版本号仍为 1.2.6，因为这是本地修复构建而非正式发布；不能只凭面板版本号判断是否更新。
- 未由助手启动新 TeamCodex，未执行任何客户端注入；运行和实际挂载验证交由用户。此次已完成的是安装文件更新，不是“挂载恢复成功”。
- 原有应用将可变数据放在签名资源目录内；更新前严格签名检查已因这些数据文件失败。此次重新签名在更新时点通过，但未扩展实施数据目录迁移。

## 后续截图反馈：macOS 提示应用无法打开

- 已确认本轮安装遗漏：安装版主二进制和内置 `macos/launch.sh` 均为 `0644`，旧版主二进制为 `0755`。编译产物原本可执行，ZIP 对显式 mode 只写权限、未写 Unix regular-file 类型，macOS `ditto` 解包后丢失执行位。
- 新增真实 `ditto` 解包回归，并加强 ZIP 元数据检查；修复前共三项断言失败，包含真实解包得到 `0644` 的复现。`add_file` 现显式设置 Unix 类型并写入 `S_IFREG | permissions`。
- 已直接修正 `/Applications/TeamCodex.app/Contents/MacOS/TeamCodex` 和 `Contents/Resources/app/macos/launch.sh` 为 `0755`。两个入口可执行，Info.plist 指向正确，已安装应用严格签名检查通过。没有删除 quarantine，没有启动应用，没有修改数据或重启共享 Hub。
- 只读 `spctl --assess` 返回 `accepted / override=security disabled`，反映本机既有系统策略；本轮没有修改该策略，此结果不能当作开发者签名或公证证明。
- 打包回归现在为 20 pass（macOS 真实解包执行，原生编译仍用 mock）；冷启动、菜单和工作区桥接定向复验为 18 pass；`git diff --check` 通过。
- 另用真实 `swiftc` 重建本机离线测试包 `TeamCodex-macOS-layout-fix-permissions-test.zip`，SHA-256 为 `b32acf8e7de1a4c17032799f67ea180a172795571896d435be67319de56dc8cb`。真实 `ditto` 解包后的主二进制、内外两份 launch.sh、外层 `.command` 均为 `0755`，解包应用严格签名检查通过。
- 先前无 permissions 后缀的 ZIP 保留作故障证据，不应继续安装。此修复只证明执行权限缺陷已消除，不代表真实客户端挂载已恢复；启动和挂载仍由用户测试。

## 用户再次反馈：打开后无反应

- 21:41:46 的 `launcher.log` 及进程检查证实安装版 TeamCodex、控制后台和注入器已经启动；原生面板可见，显示“已挂载；新版界面在下次正常重开 Codex 后生效”。因此此时不再是主程序缺少执行权限。
- 持续刷新的 `attach-state.json` 显示 Codex 当前页面仍为 `inline-v103`、`pendingUpdate:true`，而安装版新脚本为 `inline-v104`。`hotUpdateDecision` 默认延后升级，旧版侧栏脚本在已安装的页面上也主动返回 `client-reopen-required`，以保留已有页面与草稿。
- 仅重新打开 TeamCodex 或点击“重新挂载”不会替换已运行 Codex 页面中的 v103。需要用户正常完全退出并重新打开 Codex，随后观察状态是否变为 `inline-v104`、`pendingUpdate:false`。尚未得到这一轮重开后的实际挂载回执，不能记为恢复成功。
- 运行数据写入 app bundle 后严格签名会失效；这是原有数据路径的独立维护问题，不把它当成本轮当前页面停在 v103 的原因。

## 2026-09-27 重新打开 Codex 后的回执

- 00:05:12（Asia/Shanghai）本机安装版持续刷新的 `attach-state.json` 显示 `installed:true`、`uiVersion:inline-v104`、`pendingUpdate:false`、`state:attached`，目标进程与前次不同。可确认新版脚本已挂到当前页面。
- 此回执只覆盖注入状态；Team 入口点击、讨论、知识库、看板业务操作及 Windows 实机仍没有这次的用户交互验收。
