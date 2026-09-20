// 只提供静态样式夹具，不启动注入器，不读取/修改真实团队数据，也没有账号接口。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = new Map([
  ['/', ['tests/workspace_style_fixture.html', 'text/html']],
  ['/workspace.css', ['inject/workspace.css', 'text/css']],
  ['/workspace.js', ['inject/workspace.js', 'text/javascript']],
]);
const server = http.createServer((request, response) => {
  const entry = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (request.method !== 'GET' || !entry) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': entry[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(fs.readFileSync(path.join(root, entry[0])));
});
server.listen(19932, '127.0.0.1', () => console.log('静态样式夹具 http://127.0.0.1:19932'));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
