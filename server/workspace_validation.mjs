import crypto from 'node:crypto';

export const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const text = (value, max = 2000) => {
  if (typeof value !== 'string' || value.length > max) fail(`文本必须为字符串且不超过 ${max} 字符`);
  return value.trim();
};
export const title = (value) => { const clean = text(value, 200); if (!clean) fail('标题不能为空'); return clean; };
export const choice = (value, values) => { if (!values.includes(value)) fail('无效的状态或选项'); return value; };
export const ids = (value) => {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== 'string')) fail('关联列表无效');
  return [...new Set(value)];
};
export const date = (value) => {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('日期格式无效');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('日期无效');
  return value;
};
export const checkSecrets = (value) => {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,})|(?:api[_-]?key|password|secret|access[_-]?token)\s*[=:]\s*["']?(?!\$\{|<|YOUR_|REDACTED|example|placeholder)[A-Za-z0-9/+_-]{12,}/i.test(value)) {
    fail('检测到疑似密钥，请脱敏后再上传或保存');
  }
};
export const safeImageType = (bytes) => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return '';
};
export const decodeFile = (body) => {
  if (typeof body.base64 !== 'string' || body.base64.length > 14 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64)) fail('文件编码无效或超过 10MB');
  const bytes = Buffer.from(body.base64, 'base64');
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) fail('文件不能为空且不得超过 10MB', 413);
  const filename = text(body.filename || 'attachment', 200).replace(/[\\/\x00-\x1f]/g, '_');
  const textFile = /\.(md|txt|json|ya?ml|toml|ini|conf|csv|log|xml|svg|env)$/i.test(filename);
  const content = textFile ? bytes.toString('utf8') : '';
  if (content.length > 200000) fail('文本文件不得超过 200000 字符');
  if (textFile) checkSecrets(content);
  return { bytes, filename, content, mime: safeImageType(bytes) || (textFile ? 'text/plain' : 'application/octet-stream'), blobHash: hash(bytes), size: bytes.length };
};

export const validateCalendar = (body, previous) => {
  const calendar = { timezone: previous.timezone, workDays: previous.workDays, unavailable: previous.unavailable };
  if (body.timezone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }).format(); } catch { fail('时区无效'); }
    calendar.timezone = text(body.timezone, 80);
  }
  if (body.workDays !== undefined) {
    if (!Array.isArray(body.workDays) || body.workDays.some(n => !Number.isInteger(n) || n < 0 || n > 6)) fail('工作日无效');
    calendar.workDays = [...new Set(body.workDays)];
  }
  if (body.unavailable !== undefined) calendar.unavailable = ids(body.unavailable).map(date);
  return calendar;
};
