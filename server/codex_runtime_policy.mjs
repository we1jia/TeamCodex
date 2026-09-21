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
export const createLaunchController = ({ inspect, restart, launch, attach, prepare = async () => ({ stamp: '' }), now = Date.now }) => {
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
        if (ticket.target !== fingerprint(snapshot.target) || ticket.path !== snapshot.availablePath || snapshot.state !== ticket.state) failure('实例已变化，已取消操作，请重新确认');
        const context = await prepare(snapshot);
        if (context.stamp !== ticket.stamp) failure('启动环境或账号配置已变化，已取消操作，请重新确认');
        if (snapshot.state === 'not_running') await launch({ path: snapshot.availablePath, args: [] }, context);
        else await restart(snapshot.target, context);
        await attach();
        return { ok: true, mode: 'waiting_for_injection', message: '调试通道已就绪，正在等待界面挂载确认' };
      }
      if (snapshot.state === 'ready') { await attach(); return { ok: true, mode: 'attaching', message: '复用当前调试通道，正在等待界面挂载确认；未重启' }; }
      if (snapshot.state === 'ambiguous') return { ok: false, mode: 'ambiguous', message: '检测到多个 Codex 主实例，不能猜测要重启哪一个，请先确认目标' };
      if (snapshot.state === 'connecting') return { ok: false, mode: 'waiting', message: '实例已有调试参数但通道尚未就绪，正在等待；不会重复启动' };
      if (!['not_running', 'restart_required', 'connection_failed'].includes(snapshot.state)) return { ok: false, mode: 'manual', message: '暂时无法确认 Codex 状态，请稍后重新检查；未执行启动或重启' };
      if (!snapshot.availablePath) return { ok: false, mode: 'missing', message: '未找到可验证的 Codex 桌面程序，请先手动启动它' };
      let context;
      try { context = await prepare(snapshot); }
      catch { return { ok: false, mode: 'manual', message: '无法完整读取 Codex 启动环境，未执行重启。请检查应用权限，或保存工作并自行退出后再点击启动并挂载。' }; }
      const confirmToken = crypto.randomBytes(24).toString('hex');
      tickets.clear();
      tickets.set(confirmToken, { at: now(), target: fingerprint(snapshot.target), path: snapshot.availablePath, state: snapshot.state, stamp: context.stamp });
      return { ok: false, requires_restart_confirm: true, confirmToken, targetPid: snapshot.target?.pid || null,
        message: snapshot.target ? `当前 Codex（PID ${snapshot.target.pid}）无法挂载，需要重新打开。这会中断正在运行的任务，请先保存工作。将保留当前启动参数和环境，不修改账号或网络配置；退出超时会停止，不会强杀。是否继续？` : '是否启动 Codex 并挂载团队空间？不会修改账号或网络配置。' };
    } finally { inFlight = false; }
  };
  return { request };
};
