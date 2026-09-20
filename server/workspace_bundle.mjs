import fs from 'node:fs';
import path from 'node:path';

// 服务端和本地离线注入使用相同资源，不依赖宿主允许动态加载脚本。
export const workspaceBundle = (root) => {
  const css = fs.readFileSync(path.join(root, 'inject/workspace.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'inject/workspace.js'), 'utf8');
  return `window.__TEAM_WORKSPACE_CSS__=${JSON.stringify(css)};\n${js}\n`;
};
