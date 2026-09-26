// 仅依赖已渲染的 DOM，不读取 React 内部状态或调用宿主私有 IPC。
// 这些标记来自已核对的客户端实现，不是官方稳定扩展接口。
export function createHostAdapter(document, window) {
  const railSelector = 'nav[data-app-navigation-rail]';
  const sidebarSelector = 'aside.app-shell-left-panel';
  const titlebarSelector = '[data-app-shell-titlebar="true"], [data-app-shell-main-titlebar="true"], [data-app-shell-application-menu-bar="true"]';
  const ownSelector = '#team-context-sidebar-tab, #team-context-fullscreen-page, #team-context-dropdown-menu';
  const rect = element => {
    if (!element?.getBoundingClientRect || element.closest(ownSelector)) return null;
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return null;
    const style = window.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 ||
        bounds.width <= 0 || bounds.height <= 0 || bounds.right <= 0 || bounds.bottom <= 0) return null;
    return bounds;
  };
  const visible = (selector, root = document) => [...root.querySelectorAll(selector)].filter(element => rect(element));
  const unsupported = reason => ({ supported: false, kind: 'unsupported', reason });

  function locate() {
    const rails = visible(railSelector);
    const frames = visible('[data-app-shell-frame]');
    // 标记存在但正在隐藏/重建时也不能误回退到另一片区域。
    if (document.querySelector(railSelector)) {
      if (rails.length !== 1) return unsupported(rails.length ? 'ambiguous-navigation-rail' : 'navigation-rail-hidden');
      const rail = rails[0];
      const frame = rail.closest('[data-app-shell-frame]') || (frames.length === 1 ? frames[0] : null);
      if (!frame) return unsupported('app-shell-frame-missing');
      const mains = visible('[data-app-shell-main-surface]', frame);
      if (mains.length !== 1) return unsupported(mains.length ? 'ambiguous-main-surface' : 'main-surface-missing');
      const controls = visible('button[data-sidebar-destination], a[data-sidebar-destination]', rail);
      if (!controls.length) return unsupported('rail-destination-missing');
      // 取现有 destination 的共同容器，在最后一项之后插入；不复制原生 data/action 属性。
      let parent = controls[0].parentElement;
      while (parent && parent !== rail && !controls.every(control => parent.contains(control))) parent = parent.parentElement;
      if (!parent || !rail.contains(parent)) return unsupported('rail-group-missing');
      let anchor = controls.at(-1);
      while (anchor.parentElement !== parent) anchor = anchor.parentElement;
      const sidebars = visible(sidebarSelector, frame);
      if (sidebars.length > 1) return unsupported('ambiguous-sidebar');
      return { supported: true, kind: 'rail', navigation: rail, parent, anchor, frame,
        sidebar: sidebars[0] || null, main: mains[0], controls };
    }
    const sidebars = visible(sidebarSelector);
    const knownSidebars = [...document.querySelectorAll(sidebarSelector)].filter(node => !node.closest(ownSelector));
    if (!sidebars.length && knownSidebars.length === 1) {
      return { supported: false, kind: 'legacy', reason: 'sidebar-hidden', sidebar: knownSidebars[0] };
    }
    if (sidebars.length !== 1) return unsupported(sidebars.length ? 'ambiguous-sidebar' : 'sidebar-missing');
    const sidebar = sidebars[0];
    const navs = visible('nav[role="navigation"]', sidebar);
    if (navs.length !== 1) return unsupported(navs.length ? 'ambiguous-navigation' : 'navigation-missing');
    const navigation = navs[0];
    const buttons = visible('button', navigation);
    const label = button => (button.getAttribute('aria-label') || button.textContent || '').trim();
    const anchor = buttons.find(button => /^(插件|Plugins)$/i.test(label(button))) ||
      buttons.find(button => /^(定时任务|Scheduled tasks?)$/i.test(label(button))) ||
      buttons.find(button => /^(新对话|新聊天|New chat)$/i.test(label(button)));
    if (!anchor) return unsupported('navigation-anchor-missing');
    return { supported: true, kind: 'legacy', navigation, sidebar, parent: anchor.parentElement, anchor };
  }

  function describe() {
    const host = locate();
    return { supported: host.supported, kind: host.kind, reason: host.reason || null };
  }

  function pageBounds() {
    const host = locate();
    if (!host.supported || host.kind !== 'rail') return null;
    const main = rect(host.main), rail = rect(host.navigation), sidebar = rect(host.sidebar);
    if (!main || !rail) return null;
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    // DOMRect 已包含宿主缩放；不能再乘 devicePixelRatio 或 codex-window-zoom。
    let top = Math.max(0, main.top);
    for (const titlebar of visible(titlebarSelector, host.frame)) {
      const bar = rect(titlebar);
      if (bar.top >= 0 && bar.top <= 80 && bar.bottom <= 160) top = Math.max(top, bar.bottom);
    }
    const left = Math.max(0, main.left, rail.right, sidebar?.right || 0);
    const right = Math.min(width, main.right), bottom = Math.min(height, main.bottom);
    if (left >= right || top >= bottom) return null;
    return { left, top, right: width - right, bottom: height - bottom,
      width: right - left, height: bottom - top, sidebarCollapsed: !sidebar };
  }

  function isNavigationTarget(target) {
    if (!target || target.closest(ownSelector)) return false;
    if (target.closest('[data-app-shell-sidebar-trigger]')) return false;
    if (target.closest('.window-controls, .titlebar-controls, button[aria-label="Minimize window"], button[aria-label="Maximize window"], button[aria-label="Close window"], button[aria-label="最小化窗口"], button[aria-label="最大化窗口"], button[aria-label="关闭窗口"]')) return false;
    const host = locate();
    if (!host.supported) return false;
    return [host.navigation, host.sidebar].some(node => node?.contains(target)) ||
      Boolean(host.kind === 'rail' && target.closest(titlebarSelector));
  }

  function observedElements() {
    const host = locate();
    if (!host.supported) return [];
    return [...new Set([host.frame, host.navigation, host.sidebar, host.main,
      ...(host.frame ? visible(titlebarSelector, host.frame) : [])].filter(Boolean))];
  }

  return { locate, describe, pageBounds, isNavigationTarget, observedElements };
}

export const hostAdapterBootstrap = `window.TeamCodexHost = (${createHostAdapter.toString()})(document, window);\n`;
