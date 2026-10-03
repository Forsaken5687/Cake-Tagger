browser.action.onClicked.addListener(async tab => {
  const url = new URL(browser.runtime.getURL('index.html'));
  if (tab.url?.startsWith('https://cake.ski/')) url.searchParams.set('target', String(tab.id));
  await browser.tabs.create({ url: url.href });
});
