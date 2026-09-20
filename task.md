# 任务清单：Team 菜单栏下拉选择框实现

- [x] 1. 编写与完善 `sidebar_fullscreen.js` 下拉菜单与 Toast 组件 <!-- id: 0 -->
  - [x] 1.1 增加 Team 下拉弹出菜单的 DOM 创建、定位与展开/收起逻辑 <!-- id: 1 -->
  - [x] 1.2 增加 4 个菜单项（对话、知识库、素材库、看板）与图标 SVG <!-- id: 2 -->
  - [x] 1.3 增加“开发中”徽标与 Toast 提示交互 <!-- id: 3 -->
  - [x] 1.4 增加与探索页弹出框 1:1 一致的 CSS 样式（支持深浅色自适应） <!-- id: 4 -->
- [x] 2. 本地真实 Codex 环境热注入与交互验证 <!-- id: 5 -->
  - [x] 2.1 同步更新 `/Applications/TeamCodex.app/Contents/Resources/app/inject/sidebar_fullscreen.js` <!-- id: 6 -->
  - [x] 2.2 通过 CDP 注入并测试点击 Team 展开、位置、关闭、点击对话切入全屏、点击开发中项提示 <!-- id: 7 -->
  - [x] 2.3 截取屏幕效果图作为验证证据 <!-- id: 8 -->
- [x] 3. 跨平台打包与回归测试 <!-- id: 9 -->
  - [x] 3.1 运行回归测试套件 `test_rooms_and_auth.mjs` <!-- id: 10 -->
  - [x] 3.2 重新构建 macOS 离线包与 Windows 离线包 <!-- id: 11 -->
  - [x] 3.3 输出 Walkthrough 并提交 Git <!-- id: 12 -->
