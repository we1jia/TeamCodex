import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceStore } from '../server/workspace_store.mjs';

const fixture = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'team-workspace-test-'));
  const store = new WorkspaceStore(directory);
  const alice = store.enroll('project', { name: 'Alice', presenceId: 'alice' });
  const bob = store.enroll('project', { name: 'Bob', presenceId: 'bob' });
  return { directory, store, alice: store.authenticate('project', alice.token), bob: store.authenticate('project', bob.token) };
};

test('资料私人隔离、不可跨房间读取、共享任务不可引用私人资料', () => {
  const { store, alice, bob } = fixture();
  const privateDoc = store.createResource(alice, { title: 'Private', content: 'secret', visibility: 'private' });
  assert.equal(store.state(bob).resources.length, 0);
  assert.throws(() => store.resource(bob, privateDoc.id), /不存在/);
  assert.throws(() => store.createTask(alice, { title: 'Task', resourceIds: [privateDoc.id] }), /私人/);
  assert.throws(() => store.authenticate('another-room', 'invalid'), /凭证/);
  assert.equal(store.state(alice).resources.length, 1);
});

test('同一任务审核流转、退回原因、并发版本冲突', () => {
  const { store, alice, bob } = fixture();
  let task = store.createTask(alice, { title: 'Ship', assigneeId: alice.id, reviewerId: bob.id });
  task = store.updateTask(alice, task.id, { version: task.version, status: 'in_progress' });
  assert.throws(() => store.updateTask(alice, task.id, { version: 1, title: 'old' }), /其他成员/);
  assert.throws(() => store.updateTask(alice, task.id, { version: task.version, status: 'done' }), /审核/);
  task = store.updateTask(alice, task.id, { version: task.version, status: 'review', result: '完成实现并通过测试' });
  assert.throws(() => store.updateTask(alice, task.id, { version: task.version, status: 'done' }), /审核人/);
  assert.throws(() => store.updateTask(bob, task.id, { version: task.version, status: 'in_progress' }), /原因/);
  task = store.updateTask(bob, task.id, { version: task.version, status: 'done' });
  assert.equal(task.status, 'done');
  assert.equal(task.history.at(-1).actorId, bob.id);
});

test('资料修订与持久化、内容哈希复用、上下文不包含私人资料', () => {
  const { store, alice, directory } = fixture();
  const body = { title: 'Runbook', filename: 'runbook.md', base64: Buffer.from('步骤一').toString('base64'), visibility: 'room' };
  const first = store.createResource(alice, body);
  const second = store.createResource(alice, { ...body, title: 'Reference' });
  assert.equal(first.blobHash, second.blobHash);
  assert.equal(fs.readdirSync(path.join(directory, 'workspace-blobs')).length, 1);
  const next = store.updateResource(alice, first.id, { version: first.version, content: '修订', status: 'confirmed' });
  assert.equal(next.version, 2);
  assert.equal(next.revisions[0].content, first.content);
  const restored = new WorkspaceStore(directory);
  assert.equal(restored.resource(alice, first.id).content, '修订');
  const privateDoc = store.createResource(alice, { title: 'Private', content: 'secret' });
  assert.throws(() => store.context(alice, { resourceIds: [privateDoc.id] }), /私人/);
});

test('工作日历校验、日期和关联完整性', () => {
  const { store, alice } = fixture();
  assert.throws(() => store.updateProfile(alice, { timezone: 'not/a-zone' }), /时区/);
  assert.throws(() => store.createTask(alice, { title: 'bad', startDate: '2026-02-30' }), /日期/);
  assert.throws(() => store.createTask(alice, { title: 'bad', startDate: '2026-09-22', dueDate: '2026-09-20' }), /日期/);
  assert.throws(() => store.createTask(alice, { title: 'bad', assigneeId: 'spoofed' }), /成员/);
  const person = store.updateProfile(alice, { timezone: 'Asia/Shanghai', workDays: [1, 2, 3, 4, 5], unavailable: ['2026-09-25'] });
  assert.deepEqual(person.unavailable, ['2026-09-25']);
});

test('全文搜索覆盖正文尾部，同时过滤私人内容', () => {
  const { store, alice, bob } = fixture();
  const resource = store.createResource(alice, { title: '普通标题', content: 'x'.repeat(1000) + '尾部关键词', visibility: 'room' });
  store.createResource(alice, { title: 'Private', content: '尾部关键词' });
  assert.deepEqual(store.state(bob, '尾部关键词').search.resourceIds, [resource.id]);
});

test('私人版本不会随共享当前版本泄露，写盘失败不更新内存', () => {
  const { store, alice, bob, directory } = fixture();
  const resource = store.createResource(alice, { title: 'private history', content: 'private past' });
  const updated = store.updateResource(alice, resource.id, { version: 1, visibility: 'room', content: 'public now' });
  assert.equal(store.resource(bob, updated.id).revisions.length, 0);
  store.file = directory;
  assert.throws(() => store.createTask(alice, { title: '未持久化' }));
  assert.equal(store.state(alice).tasks.length, 0);
});
