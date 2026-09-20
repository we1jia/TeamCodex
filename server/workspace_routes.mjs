import fs from 'node:fs';
import path from 'node:path';
import { WorkspaceStore } from './workspace_store.mjs';
import { fail, safeImageType } from './workspace_validation.mjs';

const readJson = async (req) => {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 15 * 1024 * 1024) fail('请求超过 15MB', 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请求格式无效');
    return body;
  } catch (error) { fail(error.status ? error.message : 'JSON 格式无效'); }
};

// 只展示当前已鉴权房间明确引用的历史附件，不扫描其他房间或上传目录。
const roomAttachments = (room) => (room.messages || []).flatMap(message => (Array.isArray(message.metadata?.images) ? message.metadata.images : []).map((image, index) => ({
  id: `chat:${message.id}:${index}`, sourceMessageId: message.id, ownerName: message.actor_name || message.actor_id,
  createdAt: message.created_at, filename: typeof image === 'object' ? image.filename || '对话图片' : '对话图片',
}))).slice(-200);

const attachmentContent = (room, body, directory) => {
  const message = (room.messages || []).find(m => m.id === body.messageId);
  const image = message?.metadata?.images?.[body.index];
  if (!image) fail('原消息附件不存在', 404);
  const url = typeof image === 'string' ? image : image.url;
  let pathname;
  try { pathname = new URL(url, 'http://attachment.local').pathname; } catch { fail('附件路径无效'); }
  if (!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(pathname)) fail('此历史附件不支持读取');
  const filename = path.basename(pathname);
  const bytes = fs.readFileSync(path.join(directory, 'uploads', filename));
  if (bytes.length > 10 * 1024 * 1024) fail('附件超过 10MB');
  const mime = safeImageType(bytes);
  if (!mime) fail('此历史附件不是可安全预览的图片');
  return { filename: image.filename || filename, base64: bytes.toString('base64'), mime, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
};

export const createWorkspaceRoutes = ({ directory, getRoom, extractRoomId, verifyRoomAuth, sendJson, broadcast }) => {
  const store = new WorkspaceStore(directory);
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/workspace/')) return false;
    try {
      const body = ['POST', 'PATCH'].includes(req.method) ? await readJson(req) : {};
      const roomId = extractRoomId(req, url, body);
      const room = getRoom(roomId, false);
      if (typeof room?.id !== 'string' || room.id !== roomId) fail('房间不存在', 404);
      const auth = verifyRoomAuth(room, req, url, body);
      if (!auth.ok) fail(auth.message, auth.status);
      const route = url.pathname.slice('/api/workspace/'.length);
      if (route === 'enroll' && req.method === 'POST') {
        sendJson(res, 201, store.enroll(room.id, body));
        broadcast(room.id, 'workspace_changed', { changed: true });
        return true;
      }
      const actor = store.authenticate(room.id, req.headers['x-workspace-token']);
      let result;
      if (route === 'state' && req.method === 'GET') result = { ...store.state(actor, url.searchParams.get('query') || ''), room: { id: room.id, name: room.name }, attachments: roomAttachments(room), presenceMembers: room.members || [] };
      else if (route === 'profile' && req.method === 'PATCH') result = store.updateProfile(actor, body);
      else if (route === 'context' && req.method === 'POST') result = store.context(actor, body);
      else if (route === 'attachment' && req.method === 'POST') result = attachmentContent(room, body, directory);
      else if (route === 'tasks' && req.method === 'POST') result = store.createTask(actor, body);
      else if (/^tasks\/[^/]+$/.test(route) && req.method === 'PATCH') result = store.updateTask(actor, route.split('/')[1], body);
      else if (route === 'resources' && req.method === 'POST') {
        if (body.sourceMessageId && !(room.messages || []).some(m => m.id === body.sourceMessageId)) fail('原消息不存在');
        result = store.createResource(actor, body);
      } else if (/^resources\/[^/]+\/content$/.test(route) && req.method === 'GET') result = store.content(actor, route.split('/')[1]);
      else if (/^resources\/[^/]+$/.test(route) && req.method === 'GET') result = store.resource(actor, route.split('/')[1]);
      else if (/^resources\/[^/]+$/.test(route) && req.method === 'PATCH') result = store.updateResource(actor, route.split('/')[1], body);
      else fail('接口不存在或方法不支持', 404);
      sendJson(res, req.method === 'POST' && ['tasks', 'resources'].includes(route) ? 201 : 200, result);
      if (req.method === 'PATCH' || ['tasks', 'resources'].includes(route)) broadcast(room.id, 'workspace_changed', { changed: true });
    } catch (error) {
      sendJson(res, error.status || 500, { ok: false, message: error.status ? error.message : '工作区读写失败，请检查服务日志；未自动重试' });
      if (!error.status) console.error('[workspace]', error);
    }
    return true;
  };
};
