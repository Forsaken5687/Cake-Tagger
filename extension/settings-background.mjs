import { SETTINGS_KEY, normalizeSettings } from '../preferences.mjs';
export async function handleSettings(browser, message) {
  if (message.type === 'cake-tagger:settings-get') {
    return { settings: normalizeSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]) };
  }
  const settings = normalizeSettings(message.settings);
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  const update = { type: 'cake-tagger:settings-updated', settings };
  await browser.runtime.sendMessage(update).catch(() => {});
  const tabs = await browser.tabs.query({ url: 'https://cake.ski/*' });
  await Promise.all(tabs.map(tab => browser.tabs.sendMessage(tab.id, update).catch(() => {})));
  return { settings };
}
