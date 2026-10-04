(() => {
  if (location.origin !== 'http://127.0.0.1:8765' || !['/', '/index.html'].includes(location.pathname)) return;
  const channel = new URL(location.href).searchParams.get('channel');
  if (!/^[a-f0-9]{32}$/.test(channel || '')) return;
  const allowed = new Set(['cake-tagger:list-tabs', 'cake-tagger:get-theme', 'cake-tagger:transfer', 'cake-tagger:settings-notify']);
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== channel || event.data.type !== 'cake-tagger:rpc' || !allowed.has(event.data.message?.type)) return;
    let response;
    try { response = await browser.runtime.sendMessage(event.data.message); } catch { response = { error: 'error.sitePermission' }; }
    window.postMessage({ type: 'cake-tagger:rpc-response', channel, id: event.data.id, response }, location.origin);
  });
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === browser.runtime.id && message?.type === 'cake-tagger:site-theme-updated') window.postMessage({ ...message, channel }, location.origin);
  });
})();
