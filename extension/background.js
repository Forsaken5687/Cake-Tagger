browser.action.onClicked.addListener(async tab => {
  const url = new URL(browser.runtime.getURL('index.html'));
  if (tab.url?.startsWith('https://cake.ski/')) url.searchParams.set('target', String(tab.id));
  await browser.tabs.create({ url: url.href });
});
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === browser.runtime.id && (sender.url?.startsWith(browser.runtime.getURL('index.html')) || sender.url?.startsWith('https://cake.ski/')) && message?.type === 'cake-tagger:tab-id') {
    return Promise.resolve(sender.tab?.id ?? null);
  }
});
