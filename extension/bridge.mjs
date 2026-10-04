import { isFileMessage } from './message-contract.mjs';
import { translate } from '../messages.mjs';
const channel = new URL(location.href).searchParams.get('channel');
const localOrigin = 'http://127.0.0.1:8765', cakeOrigin = 'https://cake.ski';
const frame = document.querySelector('#app');
const allowed = new Set(['cake-tagger:tab-id', 'cake-tagger:get-theme', 'cake-tagger:transfer', 'cake-tagger:list-tabs', 'cake-tagger:settings-notify']);
window.addEventListener('message', async event => {
  if (event.data?.channel !== channel) return;
  if (isFileMessage(event, parent, cakeOrigin, channel, File) || (event.source === parent && event.origin === cakeOrigin && event.data.type === 'cake-tagger:theme')) {
    frame.contentWindow.postMessage(event.data, localOrigin); return;
  }
  if (event.source !== frame.contentWindow || event.origin !== localOrigin) return;
  if (event.data.type === 'cake-tagger:ready') parent.postMessage(event.data, cakeOrigin);
  if (event.data.type === 'cake-tagger:rpc' && allowed.has(event.data.message?.type)) {
    let response;
    try { response = await browser.runtime.sendMessage(event.data.message); } catch { response = { error: 'error.sitePermission' }; }
    frame.contentWindow.postMessage({ type: 'cake-tagger:rpc-response', channel, id: event.data.id, response }, localOrigin);
  }
});
try {
  const connection = await browser.runtime.sendMessage({ type: 'cake-tagger:connect' });
  if (!connection?.token) throw Error();
  const url = new URL(localOrigin);
  url.searchParams.set('integration', '1'); url.searchParams.set('embedded', '1');
  url.searchParams.set('channel', channel); url.searchParams.set('bridgeOrigin', location.origin);
  const target = new URL(location.href).searchParams.get('target'); if (target) url.searchParams.set('target', target);
  url.hash = connection.token; frame.src = url.href; frame.hidden = false;
} catch { document.querySelector('#status').textContent = translate('error.nativeServer', navigator.language.startsWith('de') ? 'de' : 'en'); }
