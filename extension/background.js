browser.action.onClicked.addListener(async tab => {
  const url = new URL(browser.runtime.getURL('index.html'));
  if (tab.url?.startsWith('https://cake.ski/')) url.searchParams.set('target', String(tab.id));
  await browser.tabs.create({ url: url.href });
});
browser.runtime.onMessage.addListener((message, sender) => {
  const analysisUrl = browser.runtime.getURL('index.html');
  const fromAnalysis = sender.url === analysisUrl || sender.url?.startsWith(analysisUrl + '?');
  const fromCake = sender.url?.startsWith('https://cake.ski/');
  if (sender.id !== browser.runtime.id || (!fromAnalysis && !fromCake)) return;
  if (message?.type === 'cake-tagger:settings-get' || ((!fromCake) && message?.type === 'cake-tagger:settings-set')) {
    return import(browser.runtime.getURL('extension/settings-background.mjs')).then(module => module.handleSettings(browser, message)).catch(() => ({ error: 'Einstellungen konnten nicht gespeichert werden.' }));
  }
  if (message?.type === 'cake-tagger:tab-id') {
    return Promise.resolve(sender.tab?.id ?? null);
  }
  if (!fromAnalysis) return;
  if (message?.type === 'cake-tagger:list-tabs') {
    return browser.tabs.query({ url: 'https://cake.ski/*' }).then(tabs => tabs.map(({ id, title }) => ({ id, title })));
  }
  if (message?.type !== 'cake-tagger:transfer') return;
  if (!Number.isInteger(message.tabId) || message.tabId <= 0 || typeof message.filename !== 'string' || !message.filename || !Array.isArray(message.tags) || message.tags.length > 258 || message.tags.some(tag => typeof tag !== 'string')) {
    return Promise.resolve({ error: 'Ungültige Tag-Übernahme.' });
  }
  const embedded = new URL(sender.url).searchParams.get('embedded') === '1';
  if (embedded && sender.tab?.id !== message.tabId) return Promise.resolve({ error: 'Upload-Tab stimmt nicht überein.' });
  return (async () => {
    try {
      const target = await browser.tabs.get(message.tabId);
      if (!target.url?.startsWith('https://cake.ski/')) return { error: 'Bitte einen cake.ski-Upload-Tab auswählen.' };
      return await browser.tabs.sendMessage(message.tabId, { type: 'cake-tagger:append', filename: message.filename, tags: message.tags });
    } catch {
      return { error: 'Upload-Formular nicht erreichbar. Bitte cake.ski neu laden.' };
    }
  })();
});
