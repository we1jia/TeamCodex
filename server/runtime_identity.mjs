import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const installationId = root => digest(fs.realpathSync(root));
export const runtimeRevision = root => digest([
  'server/launcher_host.mjs', 'server/codex_runtime.mjs', 'server/codex_runtime_policy.mjs',
  'server/launch_context.mjs', 'server/runtime_identity.mjs', 'inject/attach_codex.mjs', 'inject/cdp_websocket.mjs',
].map(file => digest(fs.readFileSync(path.join(root, file)))).join(':'));
