// 静态隔离夹具：直接提取生产模板/菜单函数，仅提供内存假数据，不连接真实Hub或Codex。
import http from 'node:http';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const productionScript = () => {
  const source = read('../inject/sidebar_fullscreen.js');
  const extract = name => {
    const start = source.indexOf(`  function ${name}(`);
    if (start < 0) throw Error(`Missing fixture function: ${name}`);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  };
  const templateStart = source.indexOf('    root.innerHTML = `');
  const template = source.slice(templateStart, source.indexOf('\n    `;', templateStart) + 7);
  const switchStart = source.indexOf("    const chatWrap = root.querySelector('.wrap');");
  const switchCode = source.slice(switchStart, source.indexOf('    const openExternalUrl', switchStart));
  const renderStart = source.indexOf('   const renderMessage = (message) =>');
  const renderCode = source.slice(renderStart, source.indexOf('    let activeRenderedRoomId', renderStart));
  const image = 'data:image/png;base64,' + fs.readFileSync(new URL('../assets/icon.png', import.meta.url)).toString('base64');
  return `
    const TAB_ID='team-context-sidebar-tab', PAGE_ID='team-context-fullscreen-page', MENU_ID='team-context-dropdown-menu';
    const page=document.getElementById(PAGE_ID), root=page.attachShadow({mode:'open'});
    const isWindows=new URLSearchParams(location.search).get('platform')==='windows', SEND_ICON='↑';
    ${template}
    const input=root.getElementById('input'); input.value='未发送的草稿：切换后应保留';
    root.getElementById('pill-text').textContent='1024 · 1 人在线';
    root.querySelectorAll('.top-actions button').forEach(button=>button.addEventListener('click',()=>button.dataset.clicked='true'));
    const config={hubUrl:location.origin,memberId:'fixture-member',nickname:'预览成员'};
    const defaultRoomId=()=> 'navigation-fixture';
    const member={id:'fixture-member',name:'预览成员',kind:'human',timezone:'Asia/Shanghai',workDays:[1,2,3,4,5],unavailable:[]};
    const state={room:{id:defaultRoomId(),name:'隔离预览'},member,members:[member],tasks:[],resources:[],attachments:[]};
    localStorage.setItem('team_workspace_identity:'+JSON.stringify([config.hubUrl,defaultRoomId()]),'fixture-only');
    const api=async(path,options={})=>{if(options.method&&options.method!=='GET')throw Error('夹具禁止写入'); if(path.startsWith('/api/workspace/state'))return structuredClone(state);throw Error('未知夹具接口');};
    const showToast=message=>console.info(message);
    const isPageActive=()=>true;
    ${switchCode}
    const findSidebar=()=>document.querySelector('aside');
    const findNav=findSidebar, textOf=node=>node.textContent.trim();
    const setTabActive=()=>{}, positionPage=()=>{}, openPage=()=>{};
    window.__teamContextOpenPage=openPage;
    let teamMenuHoverTimer=null, teamMenuLeaveTimer=null;
    ${['ensureTabStyles','cancelTeamMenuTimers','scheduleOpenTeamMenu','scheduleCloseTeamMenu','closeTeamMenu','teamMenuPosition','openTeamMenu','toggleTeamMenu','bindTeamButton'].map(extract).join('\n')}
    ${['escapeHtml','isCodexLight','readableTextOnSurface','readHostThemeTokens','readWorkspaceTypography','readDiscussionTypography','applyCodexTheme','discussionMessageMarkup','isDiscussionContinuation'].map(extract).join('\n')}
    ensureTabStyles(); bindTeamButton(document.querySelector('#'+TAB_ID+' button'));
    window.fixtureTheme=theme=>{document.documentElement.dataset.theme=theme;applyCodexTheme(page);};
    fixtureTheme('dark');
    const messagesEl=root.getElementById('messages'), knownIds=new Set(), selectedMessageIds=new Set(), members=[member];
    const imageLocalDataCache=new Map(), PLACEHOLDER_IMAGE_DATA='', isMultiSelectMode=false;
    let lastSnapshot={seq:0};
    const rebuildMinimap=()=>{}, syncMinimap=()=>{}, toggleMessageSelection=()=>{}, getMessageRows=()=>[...messagesEl.children];
    const listSidebarThreads=()=>[{id:'sample-thread',title:'原生样式与团队资料'}], openCodexThread=()=>{const button=root.querySelector('details[open] .ref');if(button)button.textContent='已验证关联打开（模拟）';};
    const openImageLightbox=()=>window.fixtureImageOpened=true;
    ${renderCode}
    const thread={id:'sample-thread',title:'原生样式与团队资料：消息气泡、图文层级以及很长的来源标题应当可以收起和完整展开'};
    const samples=[
      {id:'one',actor_id:'peer_win',actor_name:'林晓 (Win)',created_at:'2026-09-21T12:00:00Z',content:'资料已经整理好了。\\n正文、图片和来源各自清晰，讨论会更容易阅读。'},
      {id:'two',actor_id:'peer_win',actor_name:'林晓 (Win)',created_at:'2026-09-21T12:01:00Z',content:'这条是同一成员的连续消息，间距更紧凑。'},
      {id:'three',actor_id:member.id,actor_name:member.name,created_at:'2026-09-21T12:02:00Z',content:'收到，字体和字号跟随 Codex 的外观设置。',linked_thread:thread},
      {id:'four',actor_id:member.id,actor_name:member.name,created_at:'2026-09-21T12:03:00Z',content:'[图片]',linked_thread:thread,metadata:{images:[{dataUrl:${JSON.stringify(image)},name:'TeamCodex 示例图'}]}},
    ];
    samples.forEach(renderMessage);messagesEl.scrollTop=0;
    window.fixtureApplyTheme=()=>applyCodexTheme(page);
    if(isWindows){page.style.top='38px';page.style.height='calc(100vh - 38px)';page.dataset.platform='windows';}
    document.getElementById('theme').onclick=()=>fixtureTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
    document.getElementById('font-size').oninput=event=>{document.documentElement.style.fontSize=event.target.value+'px';fixtureApplyTheme();};
    document.getElementById('palette').onchange=event=>{const colors=event.target.value==='orange'?['#804000','#f99e50','#ffc050']:['#4e2d82','#8856d5','#b18bea'];['--color-background-user-message','--color-text-user-message','--app-color-text-accent'].forEach((key,i)=>document.documentElement.style.setProperty(key,colors[i]));fixtureApplyTheme();};
    document.getElementById('window-control').onclick=event=>event.currentTarget.dataset.clicked='true';
    window.fixtureReady=true;
  `;
};

const html = `<!doctype html><html lang="zh-CN" data-theme="dark"><meta charset="utf-8"><title>TeamCodex 导航隔离验收</title>
<style>
  :root {font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark;--color-surface-elevated-secondary:#262626;--color-text-primary-ghost:#ececec;--color-text-primary:#ececec;--color-token-main-surface-primary:#181818;--color-background-user-message:#4e2d82;--color-text-user-message:#8856d5;--app-color-text-accent:#b18bea}
  :root[data-theme=light]{color-scheme:light;--color-surface-elevated-secondary:#f5f5f5;--color-text-primary-ghost:#222;--color-text-primary:#222;--color-token-main-surface-primary:#fff;--color-background-user-message:#efe9fa;--color-text-user-message:#332044;--app-color-text-accent:#7040ac}
  body{margin:0;background:var(--color-token-main-surface-primary);color:var(--color-text-primary)} aside{position:fixed;inset:0 auto 0 0;width:240px;background:var(--color-surface-elevated-secondary);box-sizing:border-box;padding:60px 10px 12px}
  aside button{display:block;width:100%;height:34px;text-align:left;background:transparent;color:inherit;border:0;border-radius:8px;font:13px/1.45 system-ui;padding:0 10px;cursor:pointer}
  aside button:hover{background:#ffffff18} aside p{padding:0 10px}
  #team-context-fullscreen-page{position:fixed;left:240px;right:0;top:0;height:100vh}
  .fixture-controls{position:fixed;top:4px;left:8px;display:flex;flex-wrap:wrap;max-width:224px;gap:8px;z-index:100000} .fixture-controls button{font:inherit;cursor:pointer}
  /* 仅补齐宿主原生菜单utility样式；定位、连接区、交互均使用生产函数。 */
  .team-codex-menu-container{width:190px;padding:6px;border:1px solid #ffffff16;border-radius:16px;background:var(--color-surface-elevated-secondary);box-shadow:0 10px 26px #0004}
  .team-menu-item{padding:7px 8px;border-radius:9px;font-size:13px;line-height:20px}
  .team-menu-item>div{display:flex;align-items:center;gap:8px}.team-menu-item svg{width:16px;height:16px}.team-menu-item span{display:inline-flex;align-items:center}
  .team-menu-item [class*=text-]{font-size:11px;margin-left:auto;opacity:.6}
</style><div class="fixture-controls"><button id="theme">明暗</button><button id="window-control">模拟窗口控件</button><label>字号<input id="font-size" aria-label="模拟原生正文字号" type="number" min="12" max="22" value="14" style="width:40px"></label><select id="palette" aria-label="模拟自定义主题"><option value="purple">紫色</option><option value="orange">橙色</option></select></div>
<aside><p>Codex · 隔离预览</p><button>新对话</button><button>Pull Request</button><button>定时任务</button><button>插件</button><div id="team-context-sidebar-tab"><button>Team</button></div><button>探索</button></aside>
<div id="team-context-fullscreen-page"></div><script src="/workspace.js"></script><script src="/workspace-css.js"></script><script src="/fixture.js"></script></html>`;

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const routes = {
    '/': () => ['text/html', html],
    '/fixture.js': () => ['text/javascript', productionScript()],
    '/workspace.js': () => ['text/javascript', read('../inject/workspace.js')],
    '/workspace-css.js': () => ['text/javascript', `window.__TEAM_WORKSPACE_CSS__=${JSON.stringify(read('../inject/workspace.css'))};`],
  };
  if (request.method !== 'GET' || !routes[pathname]) { response.writeHead(404); response.end(); return; }
  const [type, body] = routes[pathname]();
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }); response.end(body);
});
server.listen(19933, '127.0.0.1', () => console.log('导航与讨论隔离夹具 http://127.0.0.1:19933 pid=' + process.pid));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
