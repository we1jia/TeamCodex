import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../inject/sidebar_fullscreen.js', import.meta.url), 'utf8');
const extract = name => {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
};
const functions = names => vm.runInNewContext(`${names.map(extract).join('\n')}\n({${names.join(',')}})`);

test('正文和图片的来源都独立于气泡，转义标题并支持展开', () => {
  const { discussionMessageMarkup } = functions(['escapeHtml', 'discussionMessageMarkup']);
  const ref = { title: '<script>来源</script>', id: 'thread-1' };
  const image = '<div class="msg-image-wrap">fixture</div>';
  const output = discussionMessageMarkup('[图片]', ref, image);
  assert.ok(!output.includes('class="bubble"'));
  assert.ok(output.indexOf('msg-image-wrap') < output.indexOf('message-reference'));
  assert.ok(output.includes('&lt;script&gt;来源&lt;/script&gt;'));
  assert.ok(output.includes('<details') && output.includes('<summary'));
  assert.ok(output.includes('type="button" class="ref"'));
  const text = discussionMessageMarkup('第一行\n第二行 <tag>', ref, '');
  assert.ok(text.includes('第一行\n第二行 &lt;tag&gt;</div>'));
  assert.ok(text.indexOf('</div>') < text.indexOf('message-reference'));
});

test('连续消息仅按精确身份、房间、线程与五分钟窗口分组，不合并快照', () => {
  const { isDiscussionContinuation: group } = functions(['isDiscussionContinuation']);
  const first = { actor_id: 'alice_mac', room_id: 'room', created_at: '2026-09-21T00:00:00Z', linked_thread: { id: 'one' } };
  const next = { ...first, created_at: '2026-09-21T00:04:00Z' };
  assert.equal(group(first, next), true);
  for (const change of [{actor_id:'alice_win'}, {room_id:'other'}, {linked_thread:{id:'two'}}, {created_at:'invalid'}, {created_at:'2026-09-21T00:06:00Z'}, {created_at:'2026-09-20T23:59:00Z'}, {metadata:{kind:'codex_context_snapshot'}}]) assert.equal(group(first, {...next,...change}), false);
  assert.equal(group({...first,actor_id:''}, {...next,actor_id:''}), false);
});

test('不合格的紫底紫字改用高对比文本；合格的原生配色保留', () => {
  const { readableTextOnSurface: pick } = functions(['readableTextOnSurface']);
  assert.equal(pick([78,45,130,255], [132,83,211,255], [24,24,24,255]), '#ffffff');
  assert.equal(pick([245,240,250,255], [30,20,40,255], [255,255,255,255]), null);
  assert.equal(pick([255,255,255,0], [200,200,200,255], [255,255,255,255]), '#000000');
});

test('正文跟随宿主实测字号和字体，不继承按钮字号、不乘DPR', () => {
  const body = { fontFamily:'Custom UI',fontSize:'18px',lineHeight:'29px',letterSpacing:'0.2px' };
  const doc = { body, querySelector:()=>null };
  const result = vm.runInNewContext(`${extract('readDiscussionTypography')}\nreadDiscussionTypography()`, {document:doc,window:{getComputedStyle:n=>n,devicePixelRatio:2}});
  assert.equal(result.fontSize,'18px'); assert.equal(result.fontFamily,'Custom UI'); assert.equal(result.lineHeight,'29px');
});

test('自定义橙色/青色主题读取语义变量，不强制归类为蓝绿紫', () => {
  const variables = { '--color-token-main-surface-primary':'#102020', '--color-text-primary':'#e0ffff', '--color-background-user-message':'#804000', '--color-text-user-message':'#fff0dd', '--app-color-text-accent':'#ff8800' };
  const style = { getPropertyValue:key=>variables[key] || '' };
  const context = { isCodexLight:()=>false, CSS:{supports:()=>true},window:{getComputedStyle:()=>style},document:{body:{},documentElement:{},querySelector:()=>null,createElement:()=>({getContext:()=>null})} };
  const result = vm.runInNewContext(`${extract('readHostThemeTokens')}\nreadHostThemeTokens()`,context);
  assert.equal(result.bubbleBg,'#804000'); assert.equal(result.bubbleText,'#fff0dd');
  assert.equal(result.hostBg,'#102020'); assert.equal(result.accentColor,'#ff8800');
});

test('入口叫讨论，原生会话操作保留原义；来源交互不触发拖选', () => {
  assert.ok(source.includes('data-team-section="chat" aria-pressed="true">讨论'));
  assert.ok(source.includes('aria-label="分享对话"'));
  assert.ok(source.includes('.snapshot-open-link, .ref, .message-reference'));
  assert.ok(source.includes("stack.querySelector('.ref')?.addEventListener('click'"));
});
