import { SETTINGS_KEY, normalizeSettings } from '../preferences.mjs';
const base = 'http://127.0.0.1:8765';
let token;
export async function connect(refresh = false) {
  if (!token || refresh) {
    const response = await fetch(base + '/api/connect', { method: 'POST', headers: { 'X-Cake-Tagger-Client': 'extension' }, signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    if (!response.ok || !/^[a-f0-9]{48}$/.test(data.token)) throw Error('error.nativeServer');
    token = data.token;
  }
  return { token };
}
async function request(path, options = {}, retry = true) {
  const connection = await connect();
  const response = await fetch(base + path, { ...options, headers: { Authorization: 'Bearer ' + connection.token, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(3000) });
  if (response.status === 401 && retry) { token = undefined; return request(path, options, false); }
  if (!response.ok) throw Error('error.nativeServer');
  return response.json();
}
export async function getSettings(browser) {
  let result = await request('/api/settings');
  if (!result.initialized) {
    // One-time migration leaves original extension preferences intact.
    const legacy = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
    if (legacy) result = await request('/api/settings', { method: 'POST', body: JSON.stringify({ settings: normalizeSettings(legacy) }) });
  }
  return result;
}
export async function notifySettings(browser) {
  const result = await getSettings(browser);
  const message = { type: 'cake-tagger:settings-updated', settings: result.settings };
  await browser.runtime.sendMessage(message).catch(() => {});
  const tabs = await browser.tabs.query({ url: 'https://cake.ski/*' });
  await Promise.all(tabs.map(tab => browser.tabs.sendMessage(tab.id, message).catch(() => {})));
  return result;
}
