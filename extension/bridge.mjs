import { isFileMessage } from './message-contract.mjs';
import { translate } from '../messages.mjs';
const channel = new URL(location.href).searchParams.get('channel');
const localOrigin = 'http://127.0.0.1:8765', cakeOrigin = 'https://cake.ski';
const frame = document.querySelector('#app');
const allowed = new Set(['cake-tagger:tab-id', 'cake-tagger:get-theme', 'cake-tagger:transfer', 'cake-tagger:list-tabs', 'cake-tagger:settings-notify', 'cake-tagger:download']);
window.addEventListener('message', async event => {
  if (event.data?.channel !== channel) return;
  if (isFileMessage(event, parent, cakeOrigin, channel, File) || (event.source === parent && event.origin === cakeOrigin && event.data.type === 'cake-tagger:theme')) {
    frame.contentWindow.postMessage(event.data, localOrigin); return;
  }
  if (event.source !== frame.contentWindow || event.origin !== localOrigin) return;
  if (['cake-tagger:ready','cake-tagger:view'].includes(event.data.type)) parent.postMessage(event.data, cakeOrigin);
  if (event.data.type === 'cake-tagger:rpc' && allowed.has(event.data.message?.type)) {
    let response;
    try { response = await browser.runtime.sendMessage(event.data.message); } catch { response = { error: 'error.sitePermission' }; }
    frame.contentWindow.postMessage({ type: 'cake-tagger:rpc-response', channel, id: event.data.id, response }, localOrigin);
  }
});
try {
  const connection = await browser.runtime.sendMessage({ type: 'cake-tagger:connect' });
  if (!connection?.token) throw Error();
  const url = new URL('/analysis.html',localOrigin);
  url.searchParams.set('integration', '1'); url.searchParams.set('embedded', '1');
  url.searchParams.set('channel', channel); url.searchParams.set('bridgeOrigin', location.origin);
  const target = new URL(location.href).searchParams.get('target'); if (target) url.searchParams.set('target', target);
  url.hash = connection.token; frame.src = url.href; frame.hidden = false;
} catch {
  document.querySelector('#status').textContent = translate('error.nativeServer', navigator.language.startsWith('de') ? 'de' : 'en');
  parent.postMessage({ type: 'cake-tagger:connection-error', channel }, cakeOrigin);
}

// The bridge initiates a tab-bound port; broadcasts cannot locate this frame reliably.
const commandPort=browser.runtime.connect({name:'cake-tagger:upload:'+channel});
commandPort.onMessage.addListener(message=>{
 if(message?.type!=='command' || !Number.isSafeInteger(message.id))return;
 frame.contentWindow.postMessage({type:'cake-tagger:command',channel,...message.command},localOrigin);
 commandPort.postMessage({type:'ack',id:message.id,accepted:true});
});
// Keep Chrome's service worker alive while this upload session is open.
const heartbeat=setInterval(()=>{try{commandPort.postMessage({type:'ping'});}catch{}},20000);
commandPort.onDisconnect.addListener(()=>{clearInterval(heartbeat);parent.postMessage({type:'cake-tagger:command-connection-error',channel},cakeOrigin);});
// Preference broadcasts remain independent of command delivery.
browser.runtime.onMessage.addListener((message,sender)=>{
 const trusted=!sender.url || [browser.runtime.getURL('extension/background.js'),browser.runtime.getURL('extension/chrome-worker.mjs'),browser.runtime.getURL('_generated_background_page.html')].includes(sender.url);
 if(sender.id===browser.runtime.id && trusted && message?.type==='cake-tagger:settings-updated')frame.contentWindow.postMessage({type:'cake-tagger:settings-updated',channel},localOrigin);
});
