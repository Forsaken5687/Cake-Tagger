// The application always lives on loopback. Only upload integration crosses
// into the extension; model inputs and server credentials never use this relay.
export function installPageBridge() {
  const url = new URL(location.href), channel = url.searchParams.get('channel');
  if (url.searchParams.get('embedded') !== '1' || parent === window || url.searchParams.get('integration') !== '1' || !/^[a-f0-9]{32}$/.test(channel || '')) return false;
  const origin = url.searchParams.get('bridgeOrigin');
  if (!/^(moz-extension:\/\/[a-f0-9-]{36}|chrome-extension:\/\/[a-p]{32})$/.test(origin || '')) return false;
  const target = parent, pending = new Map(), listeners = [];
  let serial = 0;
  window.addEventListener('message', event => {
    if (event.source !== target || event.origin !== origin || event.data?.channel !== channel) return;
    if (event.data.type === 'cake-tagger:rpc-response') {
      const job = pending.get(event.data.id); if (!job) return;
      pending.delete(event.data.id); clearTimeout(job.timer); job.resolve(event.data.response);
    }
    if (event.data.type === 'cake-tagger:site-theme-updated') for (const callback of listeners) callback(event.data, { id: 'local-bridge' });
    if (['cake-tagger:files', 'cake-tagger:theme', 'cake-tagger:command', 'cake-tagger:settings-updated'].includes(event.data.type)) {
      window.dispatchEvent(new CustomEvent('cake-tagger:upload-message', { detail: event.data }));
    }
  });
  globalThis.browser = { runtime: { id: 'local-bridge',
    sendMessage(message) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => { pending.delete(id); reject(Error('error.sitePermission')); }, 10000);
        pending.set(id, { resolve, timer });
        target.postMessage({ type: 'cake-tagger:rpc', channel, id, message }, origin);
      });
    }, onMessage: { addListener(callback) { listeners.push(callback); } } } };
  return true;
}
