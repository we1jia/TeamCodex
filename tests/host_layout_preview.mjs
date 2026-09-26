// 新旧宿主的隔离验收页：加载完整生产注入代码，但所有 Hub 调用只返回内存假数据。
// 不连接真实 Codex/CDP，不访问共享房间，不修改生产配置。
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { workspaceBundle } from '../server/workspace_bundle.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = () => workspaceBundle(root) + fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');
const html = `<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8">
<title>Team Codex 双层导航隔离验收</title><style>
:root{font:14px/1.5 system-ui;color-scheme:dark;--color-text-primary:#ececec;--color-token-main-surface-primary:#181818;--color-surface-elevated-secondary:#222;--color-text-primary-ghost:#ececec}
*{box-sizing:border-box}body{margin:0;background:#181818;color:#ececec}button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent;border-radius:8px;padding:8px}button:hover{background:#ffffff14}
[data-app-shell-frame]{position:fixed;inset:0}[data-app-shell-titlebar]{position:absolute;inset:0 0 auto;height:44px;display:flex;align-items:center;justify-content:space-between;background:#292e31;padding:0 12px;z-index:40}
[data-app-navigation-rail]{position:absolute;left:0;top:44px;bottom:0;width:56px;background:#292e31;display:flex;flex-direction:column;align-items:center;padding-top:12px}.rail-items{display:flex;flex-direction:column;align-items:center;gap:10px}.rail-items button{width:36px;height:36px;padding:6px}.rail-items svg{width:22px;height:22px}
.app-shell-left-panel{position:absolute;left:56px;top:44px;bottom:0;width:240px;background:#202324;padding:18px 12px}.app-shell-left-panel nav{display:flex;flex-direction:column;gap:10px}.app-shell-left-panel button{text-align:left}
[data-app-shell-main-surface]{position:absolute;left:296px;top:44px;right:0;bottom:0;padding:32px}
body.collapsed .app-shell-left-panel{display:none}body.collapsed [data-app-shell-main-surface]{left:56px}
body.legacy [data-app-navigation-rail],body.legacy [data-app-shell-titlebar]{display:none}body.legacy .app-shell-left-panel{left:0;top:0}body.legacy [data-app-shell-main-surface]{left:240px;top:0}
.fixture-note{font-size:12px;color:#aaa;max-width:580px}svg{fill:none;stroke:currentColor;stroke-width:1.6}
</style></head><body><div data-app-shell-frame="true">
<header data-app-shell-titlebar="true"><span>隔离夹具 · 非真实宿主</span><div><button id="collapse" data-app-shell-sidebar-trigger="true">折叠侧栏</button><button id="window-control" class="window-controls">窗口控件</button></div></header>
<nav data-app-navigation-rail="true" aria-label="全局功能"><div class="rail-items">
<button data-sidebar-destination="home" aria-label="主页" aria-current="page"><svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10H3Z"/></svg></button>
<button data-sidebar-destination="scheduled" aria-label="定时任务"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg></button>
<button data-sidebar-destination="plugins" aria-label="插件"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4Z M9 4v16 M15 4v16"/></svg></button>
</div></nav>
<aside class="app-shell-left-panel"><strong>Codex</strong><nav role="navigation" aria-label="项目与会话"><button aria-label="新聊天">新聊天</button><button aria-label="插件">插件</button><button data-app-action-sidebar-thread-id="fixture" data-app-action-sidebar-thread-title="隔离会话" data-app-action-sidebar-thread-selected="true">隔离会话</button></nav></aside>
<main data-app-shell-main-surface="default"><h1>新版双层导航兼容验收</h1><p class="fixture-note">这是基于已读取 DOM 标记制作的模拟宿主，不是官方客户端截图。页面加载完整 Team Codex 生产代码，网络只使用内存替身。</p></main>
</div>
<script>
const params=new URLSearchParams(location.search);
window.__TEAM_CONTEXT_OS__=params.get('platform')==='windows'?'win32':'darwin';
if(params.get('layout')==='legacy'){document.body.classList.add('legacy');document.querySelector('[data-app-navigation-rail]').remove();}
window.__TEAM_CONTEXT_HOST__=location.origin;window.__TEAM_CONTEXT_DEFAULT_ROOM__='fixture';window.__TEAM_CONTEXT_DEFAULT_ROOM_KEY__='fixture-only';
window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));
window.fixtureRequests=[];
const member={id:'fixture-member',name:'隔离成员',kind:'human'};
function fakeData(path){
 if(path.startsWith('/api/rooms/verify'))return {ok:true,online_count:1};
 if(path.startsWith('/api/snapshot'))return {seq:0,room:{id:'fixture'},messages:[],members:[member]};
 if(path.startsWith('/api/workspace/state'))return {room:{id:'fixture'},member,members:[member],tasks:[],resources:[],attachments:[]};
 if(path.startsWith('/api/rooms'))return {rooms:[{id:'fixture',name:'隔离房间'}]};
 return {ok:true};
}
window.__teamContextNativeCall=raw=>{const request=JSON.parse(raw);fixtureRequests.push({path:request.path,method:request.method});queueMicrotask(()=>window.__teamContextOnNativeResponse?.(request.id,{id:request.id,ok:true,status:200,data:fakeData(request.path)}));};
window.fetch=async(url,options={})=>{const path=new URL(String(url),location.origin).pathname;fixtureRequests.push({path,method:options.method||'GET'});return new Response(JSON.stringify(fakeData(path)),{status:200,headers:{'content-type':'application/json'}});};
window.EventSource=class{addEventListener(){}removeEventListener(){}close(){}};
document.getElementById('collapse').onclick=()=>document.body.classList.toggle('collapsed');
document.getElementById('window-control').onclick=e=>e.currentTarget.dataset.clicked='true';
window.fixtureInspect=()=>{const p=document.getElementById('team-context-fullscreen-page'),t=document.getElementById('team-context-sidebar-tab');return {host:window.TeamCodexHost?.describe(),tabs:document.querySelectorAll('#team-context-sidebar-tab').length,tabLayout:t?.dataset.hostLayout,page:p?{left:p.style.left,top:p.style.top,height:p.style.height,display:p.style.display}:null,draft:p?.shadowRoot?.getElementById('input')?.value,errors:fixtureErrors};};
window.fixtureRebuild=()=>{const rail=document.querySelector('[data-app-navigation-rail]');if(!rail)return;const clone=rail.cloneNode(true);clone.querySelector('#team-context-sidebar-tab')?.remove();rail.replaceWith(clone);};
</script><script src="/production.js"></script></body></html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method !== 'GET' || !['/', '/production.js'].includes(url.pathname)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': url.pathname === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'" });
  response.end(url.pathname === '/' ? html : script());
});
server.listen(0, '127.0.0.1', () => console.log(`隔离夹具 http://127.0.0.1:${server.address().port} pid=${process.pid}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
