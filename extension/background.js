browser.action.onClicked.addListener(async tab => {
  const url = new URL(browser.runtime.getURL('index.html'));
  if (tab.url?.startsWith('https://cake.ski/')) url.searchParams.set('target', String(tab.id));
  await browser.tabs.create({ url: url.href });
});
browser.runtime.onMessage.addListener((message, sender) => {
  // Only our analysis document and our content script may use the background relay.
  const analysisUrl = browser.runtime.getURL('index.html');
  const fromAnalysis = sender.url === analysisUrl || sender.url?.startsWith(analysisUrl + '?');
  const fromCake = sender.url?.startsWith('https://cake.ski/');
  if (sender.id !== browser.runtime.id || (!fromAnalysis && !fromCake)) return;
  if (fromCake && message?.type === 'cake-tagger:site-theme' && Number.isInteger(sender.tab?.id) && message.theme && JSON.stringify(message.theme).length <= 4096) {
    return browser.runtime.sendMessage({ type: 'cake-tagger:site-theme-updated', tabId: sender.tab.id, theme: message.theme }).catch(() => null);
  }
  if (message?.type === 'cake-tagger:settings-get' || ((!fromCake) && message?.type === 'cake-tagger:settings-set')) {
    if (globalThis.cakeSettingsHandler) return globalThis.cakeSettingsHandler(message).catch(() => ({ error: 'Settings could not be saved.' }));
    return import(browser.runtime.getURL('extension/settings-background.mjs')).then(module => module.handleSettings(browser, message)).catch(() => ({ error: 'Settings could not be saved.' }));
  }
  if (message?.type === 'cake-tagger:tab-id') {
    return Promise.resolve(sender.tab?.id ?? null);
  }
  if (!fromAnalysis) return;
  if (message?.type === 'cake-tagger:get-theme' && Number.isInteger(message.tabId) && message.tabId > 0) {
    if (new URL(sender.url).searchParams.get('embedded') === '1' && sender.tab?.id !== message.tabId) return Promise.resolve(null);
    return (async () => {
      try {
        const tab = await browser.tabs.get(message.tabId);
        if (!tab.url?.startsWith('https://cake.ski/')) return null;
        return await browser.tabs.sendMessage(message.tabId, { type: 'cake-tagger:theme-request' });
      } catch { return null; }
    })();
  }
  if (message?.type === 'cake-tagger:list-tabs') {
    return browser.tabs.query({ url: 'https://cake.ski/*' }).then(tabs => tabs.map(({ id, title }) => ({ id, title })));
  }
  if (message?.type !== 'cake-tagger:transfer') return;
  if (!Number.isInteger(message.tabId) || message.tabId <= 0 || typeof message.filename !== 'string' || !message.filename || !Array.isArray(message.tags) || message.tags.length > 258 || message.tags.some(tag => typeof tag !== 'string')) {
    return Promise.resolve({ error: 'Invalid tag transfer.' });
  }
  const embedded = new URL(sender.url).searchParams.get('embedded') === '1';
  // An embedded view cannot transfer tags into a different Cake tab.
  if (embedded && sender.tab?.id !== message.tabId) return Promise.resolve({ error: 'Upload tab does not match.' });
  return (async () => {
    try {
      const target = await browser.tabs.get(message.tabId);
      if (!target.url?.startsWith('https://cake.ski/')) return { error: 'Bitte einen cake.ski-Upload-Tab auswählen.' };
      return await browser.tabs.sendMessage(message.tabId, { type: 'cake-tagger:append', filename: message.filename, tags: message.tags });
    } catch {
      return { error: 'Upload form unavailable. Please reload cake.ski.' };
    }
  })();
});
