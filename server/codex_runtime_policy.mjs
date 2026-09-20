import crypto from 'node:crypto';

export const isCodexDesktop = (executable = '', args = []) => {
  const value = executable.replaceAll('\\', '/');
  if (args.some(arg => /^--type(?:=|$)/.test(arg))) return false;
  return /\/(?:ChatGPT|Codex)\.app\/Contents\/MacOS\/(?:ChatGPT|Codex)$/.test(value) || /\/(?:ChatGPT|Codex)\.exe$/i.test(value);
};
export const debugPort = args => {
  for (let index = 0; index < args.length; index++) {
    const value = args[index] === '--remote-debugging-port' ? args[index + 1] : args[index].match(/^--remote-debugging-port=(\d+)$/)?.[1];
    const port = Number(value);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  }
  return null;
};
export const launchArguments = (args, port) => {
  const result = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (/^--remote-debugging-(port|address)=/.test(arg)) continue;
    if (/^--remote-debugging-(port|address)$/.test(arg)) { index++; continue; }
    result.push(arg);
  }
  return [...result, '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`];
};
export const fingerprint = target => JSON.stringify(target && [target.pid, target.path, target.startedAt, target.args]);
export const chooseRuntime = (processes, readyPort = null) => {
  if (!processes.length) return { state: 'not_running', target: null };
  if (processes.length > 1) return { state: 'ambiguous', target: null };
  const target = processes[0];
  if (readyPort) return { state: 'ready', target, port: readyPort };
  return { state: debugPort(target.args) ? 'connecting' : 'restart_required', target };
};
export const hotUpdateDecision = ({ installed, currentVersion, nextVersion, allowUpdate }) => {
  if (!installed) return 'install';
  if (currentVersion === nextVersion) return 'keep';
  return allowUpdate ? 'replace_preserving_visibility' : 'defer';
};
const failure = message => { throw Object.assign(new Error(message), { status: 409 }); };

// 所有启动动作都来自控制面；后台观察器没有启动授权。确认票据一次有效并绑定目标快照。
export const createLaunchController = ({ inspect, restart, launch, attach, now = Date.now }) => {
  const tickets = new Map();
  let inFlight = false;
  const request = async body => {
    if (inFlight) failure('已有启动或挂载操作进行中，请等待');
    inFlight = true;
    try {
      const snapshot = await inspect();
      if (body.confirmToken) {
        const ticket = tickets.get(body.confirmToken);
        tickets.delete(body.confirmToken);
        if (!ticket || now() - ticket.at > 60000) failure('确认已失效，请重新检查运行状态');
        if (ticket.target !== fingerprint(snapshot.target) || ticket.path !== snapshot.availablePath || snapshot.managed || snapshot.argsReliable === false || snapshot.state !== ticket.state) failure('实例或路由管理状态已变化，已取消重启，请重新确认');
        if (snapshot.state === 'not_running') await launch({ path: snapshot.availablePath, args: [] });
        else await restart(snapshot.target);
        await attach();
        return { ok: true, mode: 'waiting_for_injection', message: '调试通道已就绪，正在等待界面挂载确认' };
      }
      if (snapshot.state === 'ready') { await attach(); return { ok: true, mode: 'attaching', message: '复用当前调试通道，正在等待界面挂载确认；未重启' }; }
      if (snapshot.state === 'ambiguous') return { ok: false, mode: 'ambiguous', message: '检测到多个 Codex 主实例，不能猜测要重启哪一个，请先确认目标' };
      if (snapshot.managed) return { ok: false, mode: 'managed', message: '检测到外部账号/代理管理环境。请从原启动入口启用或重启 Codex，TeamCodex 等待其调试通道，不修改管理工具或路由配置。' };
      if (snapshot.state === 'connecting') return { ok: false, mode: 'waiting', message: '实例已有调试参数但通道尚未就绪，正在等待；不会重复启动' };
      if (snapshot.argsReliable === false) return { ok: false, mode: 'manual', message: '无法完整确认原实例的启动参数，请保存工作并从原启动入口重新打开；未接管实例' };
      if (!snapshot.availablePath) return { ok: false, mode: 'missing', message: '未找到可验证的 Codex 桌面程序，请先手动启动它' };
      const confirmToken = crypto.randomBytes(24).toString('hex');
      tickets.clear();
      tickets.set(confirmToken, { at: now(), target: fingerprint(snapshot.target), path: snapshot.availablePath, state: snapshot.state });
      return { ok: false, requires_restart_confirm: true, confirmToken, targetPid: snapshot.target?.pid || null,
        message: snapshot.target ? `Codex（PID ${snapshot.target.pid}）未开启调试通道。确认后仅请求该实例退出，并保留其启动参数重新打开。请先保存工作；退出超时会停止，不会强杀。是否继续？` : `是否启动 ${snapshot.availablePath} 并开启仅本机可用的调试通道？` };
    } finally { inFlight = false; }
  };
  return { request };
};
