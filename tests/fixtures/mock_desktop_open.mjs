// 只由隔离测试通过--import加载；验证系统打开请求，不真的打开浏览器。
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const trace = process.env.TEAM_CONTEXT_TEST_OPEN_TRACE;
if (!trace) throw new Error('桌面打开替身需要隔离测试记录路径');
const originalSpawn = childProcess.spawn;
const launchers = new Set(['/usr/bin/open', 'cmd.exe', 'xdg-open']);
childProcess.spawn = (command, args, options) => {
  if (!launchers.has(command)) return originalSpawn(command, args, options);
  fs.appendFileSync(trace, JSON.stringify({ command, args }) + '\n');
  return { unref() {} };
};
syncBuiltinESMExports();
