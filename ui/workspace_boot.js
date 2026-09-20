(() => {
  const form = document.getElementById('connection');
  const host = document.getElementById('workspace');
  const reference = document.getElementById('reference');
  let workspace;
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.getElementById('theme').onclick = () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; };
  form.onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    form.querySelector('button').disabled = true;
    const request = async (pathname, options = {}) => {
      const url = new URL(pathname, location.origin);
      url.searchParams.set('room', values.room);
      const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Room-Key': values.key, ...options.headers } });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.message || data.error || `HTTP ${response.status}`), { status: response.status });
      return data;
    };
    try {
      await request('/api/snapshot');
      workspace?.destroy();
      workspace = window.TeamWorkspace.mount(host, {
        request, getScope: () => ({ hubUrl: location.origin, roomId: values.room, nickname: values.name, memberId: '' }),
        onChat: () => { host.hidden = true; form.hidden = false; },
        onReference: content => { reference.querySelector('textarea').value = content; host.hidden = true; reference.hidden = false; },
      });
      form.hidden = true; host.hidden = false; workspace.open();
    } catch (error) { document.getElementById('error').textContent = error.message; }
    finally { form.querySelector('button').disabled = false; }
  };
  document.getElementById('back').onclick = () => { reference.hidden = true; host.hidden = false; workspace.open(); };
})();
