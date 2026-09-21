(() => {
  const version = 'appearance-20260921-2';
  if (window.__teamComposerAppearance?.version === version) {
    window.__teamComposerAppearance.apply();
    return;
  }
  window.__teamComposerAppearance?.dispose();
  let scheduled = false;
  const apply = () => {
    const page = document.getElementById('team-context-fullscreen-page');
    const root = page?.shadowRoot;
    const input = root?.getElementById('input');
    if (!input) return;
    // 原生输入区可能被团队页面暂时隐藏，但其字号仍可读取；不要用正文或标题兜底。
    const native = document.querySelector('form [contenteditable="true"], [data-testid="composer-input"], [contenteditable="true"][role="textbox"], form textarea');
    const style = native && !native.closest('#team-context-fullscreen-page') ? getComputedStyle(native) : null;
    const size = Number.parseFloat(style?.fontSize);
    const fontSize = Number.isFinite(size) && size > 0 ? style.fontSize : '14px';
    const font = style?.fontFamily || getComputedStyle(document.body).fontFamily || 'system-ui';
    for (const [name, value] of [['--team-composer-font-size', fontSize], ['--team-composer-font', font]]) {
      if (page.style.getPropertyValue(name) !== value) page.style.setProperty(name, value);
    }
    let sheet = root.getElementById('team-composer-appearance');
    if (!sheet) {
      sheet = document.createElement('style');
      sheet.id = 'team-composer-appearance';
      root.appendChild(sheet);
    }
    if (sheet.dataset.version !== version) {
      // 用现有兼容外观层更新旧页面，只改变 Mac 图案，不替换头像按钮或状态节点。
      const apple = 'M17.05 20.28C16.07 21.23 15 21.08 13.97 20.63C12.88 20.17 11.88 20.15 10.73 20.63C9.29 21.25 8.53 21.07 7.67 20.28C2.79 15.25 3.51 7.59 9.05 7.31C10.4 7.38 11.34 8.08 12.13 8.14C13.31 7.9 14.44 7.18 15.7 7.27C17.21 7.39 18.35 7.99 19.1 9.07C15.98 10.94 16.72 15.05 19.58 16.2C19.01 17.7 18.27 19.19 17.05 20.28ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3C16.06 5.58 13.43 7.5 12.03 7.25Z';
      const icon = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="${apple}"/></svg>`);
      sheet.textContent = '#input{font-family:var(--team-composer-font,system-ui)!important;font-size:var(--team-composer-font-size,14px)!important;line-height:1.5!important;letter-spacing:normal!important;font-weight:400!important}#input::placeholder{font:inherit;letter-spacing:inherit;opacity:1}'
        + `.stack-avatar.is-mac>svg{visibility:hidden}.stack-avatar.is-mac::before{content:"";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:14px;height:14px;background:currentColor;mask:url("${icon}") center/contain no-repeat;-webkit-mask:url("${icon}") center/contain no-repeat;pointer-events:none}`;
      sheet.dataset.version = version;
    }
    const placeholder = '输入消息，@ 关联任务';
    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    input.setAttribute('aria-label', '输入团队消息');
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; apply(); });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.__teamComposerAppearance = { version, apply, dispose: () => observer.disconnect() };
  apply();
})();
