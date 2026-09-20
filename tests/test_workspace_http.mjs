import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('工作区 HTTP 隔离、权限、持久化与注入打包', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'team-workspace-http-'));
  const port = 21000 + Math.floor(Math.random() * 8000);
  const base = `http://127.0.0.1:${port}`;
  const start = async () => {
    const child = spawn(process.execPath, ['--import', path.join(root, 'tests/fixtures/slow_hub_start.mjs'), path.join(root, 'server/dev_host.mjs')], { env: { ...process.env, TEAM_CONTEXT_BIND_HOST: '127.0.0.1', TEAM_CONTEXT_PORT: String(port), TEAM_CONTEXT_DATA_DIR: directory, TEAM_CONTEXT_DATA_FILE: path.join(directory, 'messages.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => errors += chunk.toString());
    child.stdout.resume();
    await new Promise((resolve, reject) => {
      let settled = false;
      let retry;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); clearTimeout(retry);
        child.removeListener('error', failed); child.removeListener('exit', exited);
        if (error) { child.kill(); reject(error); } else resolve();
      };
      const failed = error => finish(error);
      const exited = code => finish(new Error(`启动失败 ${code}: ${errors}`));
      const timer = setTimeout(() => finish(new Error(`启动超时 ${errors}`)), 5000);
      child.once('error', failed); child.once('exit', exited);
      const check = async () => {
        try {
          const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(300) });
          const health = await response.json();
          if (response.ok && health.ok && health.service === 'team-context-hub' && health.port === port) return finish();
        } catch { /* 只重试无副作用探活，业务请求绝不自动重试。 */ }
        if (!settled) retry = setTimeout(check, 25);
      };
      check();
    });
    return child;
  };
  let child = await start();
  t.after(() => { child.kill(); });
  const call = async (route, { method = 'GET', body, token, key = '123456', room = '1024' } = {}) => {
    const response = await fetch(`${base}${route}?room=${room}`, { method, headers: { 'Content-Type': 'application/json', 'X-Room-Key': key, ...(token ? { 'X-Workspace-Token': token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(error => {
      throw new Error(`${method} ${route} 连接失败: ${error.cause?.code || error.message}`, { cause: error });
    });
    const data = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
    return { status: response.status, data };
  };
  let alice, bob, privateResource, sharedResource, task;
  await t.test('房间鉴权先于成员登记，不能冒用昵称', async () => {
    assert.equal((await call('/api/workspace/enroll', { method: 'POST', key: 'wrong', body: { name: 'Alice' } })).status, 401);
    alice = (await call('/api/workspace/enroll', { method: 'POST', body: { name: 'Alice' } })).data;
    bob = (await call('/api/workspace/enroll', { method: 'POST', body: { name: 'Alice' } })).data;
    assert.notEqual(alice.member.id, bob.member.id);
    assert.equal((await call('/api/workspace/state')).status, 403);
    assert.equal((await call('/api/workspace/state', { token: alice.token, room: 'Media', key: '' })).status, 403);
  });
  await t.test('私人资料不出现在他人列表、下载、原聊天快照与压缩上下文', async () => {
    privateResource = (await call('/api/workspace/resources', { method: 'POST', token: alice.token, body: { title: 'Private sentinel', content: 'secret-sentinel-data' } })).data;
    const peers = await call('/api/workspace/state', { token: bob.token });
    assert.equal(peers.data.resources.length, 0);
    assert.equal(JSON.stringify(peers.data).includes('tokenHash'), false);
    assert.equal((await call(`/api/workspace/resources/${privateResource.id}/content`, { token: bob.token })).status, 404);
    assert.equal(JSON.stringify((await call('/api/snapshot')).data).includes('secret-sentinel'), false);
    assert.equal((await call('/api/compact.txt')).data.includes('secret-sentinel'), false);
    assert.equal((await call('/api/workspace/context', { method: 'POST', token: alice.token, body: { resourceIds: [privateResource.id] } })).status, 400);
  });
  await t.test('共享文件与任务关联、日期和版本冲突', async () => {
    sharedResource = (await call('/api/workspace/resources', { method: 'POST', token: alice.token, body: { title: '架构说明', filename: 'architecture.md', base64: Buffer.from('架构正文').toString('base64'), visibility: 'room' } })).data;
    assert.equal((await call(`/api/workspace/resources/${sharedResource.id}/content`, { token: bob.token })).data.content, '架构正文');
    task = (await call('/api/workspace/tasks', { method: 'POST', token: alice.token, body: { title: '实现方案', assigneeId: alice.member.id, reviewerId: bob.member.id, resourceIds: [sharedResource.id], startDate: '2026-09-21', dueDate: '2026-09-25' } })).data;
    const patched = await call(`/api/workspace/tasks/${task.id}`, { method: 'PATCH', token: alice.token, body: { version: task.version, status: 'in_progress' } });
    assert.equal(patched.status, 200); task = patched.data;
    assert.equal((await call(`/api/workspace/tasks/${task.id}`, { method: 'PATCH', token: alice.token, body: { version: 1, title: 'stale' } })).status, 409);
    assert.equal((await call(`/api/workspace/resources/${sharedResource.id}`, { method: 'PATCH', token: alice.token, body: { version: 1, visibility: 'private' } })).status, 400);
    const context = (await call('/api/workspace/context', { method: 'POST', token: bob.token, body: { taskIds: [task.id] } })).data;
    assert.equal(context.resources[0].id, sharedResource.id);
    assert.equal(context.tasks[0].status, 'in_progress');
  });
  await t.test('审核时不能自换审核人、伪造完成或覆盖交付内容', async () => {
    task = (await call(`/api/workspace/tasks/${task.id}`, { method: 'PATCH', token: alice.token, body: { version: task.version, status: 'review', result: '测试通过' } })).data;
    assert.equal((await call(`/api/workspace/tasks/${task.id}`, { method: 'PATCH', token: alice.token, body: { version: task.version, reviewerId: alice.member.id } })).status, 400);
    assert.equal((await call(`/api/workspace/tasks/${task.id}`, { method: 'PATCH', token: alice.token, body: { version: task.version, status: 'done' } })).status, 403);
    assert.equal((await call(`/api/workspace/tasks/${task.id}`, { method: 'PATCH', token: bob.token, body: { version: task.version, status: 'in_progress' } })).status, 400);
    task = (await call(`/api/workspace/tasks/${task.id}`, { method: 'PATCH', token: bob.token, body: { version: task.version, status: 'done' } })).data;
    assert.equal(task.status, 'done');
  });
  await t.test('文件读取不能绕过权限，恶意图片不作为 HTML/SVG 执行', async () => {
    assert.equal((await call(`/uploads/${sharedResource.blobHash}`)).status, 404);
    const malicious = await call('/api/workspace/resources', { method: 'POST', token: alice.token, body: { title: '<img onerror=alert(1)>', filename: '../../payload.png', base64: Buffer.from('<script>alert(1)</script>').toString('base64') } });
    assert.equal(malicious.status, 201);
    assert.equal(malicious.data.mime, 'application/octet-stream');
    assert.equal(malicious.data.filename.includes('/'), false);
    const secret = await call('/api/workspace/resources', { method: 'POST', token: alice.token, body: { title: 'config', content: 'api_key=sk-abcdefghijklmnopqrst12345' } });
    assert.equal(secret.status, 400);
    assert.equal((await call('/api/workspace/resources', { method: 'POST', token: alice.token, body: { title: 'bad', base64: 'not-base64!!' } })).status, 400);
  });
  await t.test('原子存储重启后保留成员凭证、任务状态与文件', async () => {
    const closed = once(child, 'exit'); child.kill(); await closed; child = await start();
    const snapshot = await call('/api/workspace/state', { token: alice.token });
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.data.tasks.find(t => t.id === task.id).status, 'done');
    assert.equal((await call(`/api/workspace/resources/${sharedResource.id}/content`, { token: alice.token })).data.content, '架构正文');
  });
  await t.test('注入包含工作区资源、独立页面与主题，无占位菜单', async () => {
    const response = await call('/inject/sidebar_fullscreen.js');
    assert.equal(response.status, 200);
    assert.match(response.data, /window\.TeamWorkspace/);
    assert.match(response.data, /window\.__TEAM_WORKSPACE_CSS__/);
    assert.match(response.data, /__showWorkspace/);
    assert.doesNotMatch(response.data, /知识库功能正在开发中/);
    assert.equal((await call('/workspace')).status, 200);
    assert.equal((await call('/inject/workspace.css')).status, 200);
  });
});
