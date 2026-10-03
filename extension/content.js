(async () => {
  const { inspectUploads, appendTags } = await import(browser.runtime.getURL('extension/upload-adapter.mjs'));
  const text = await fetch(browser.runtime.getURL('tags.txt')).then(r => r.text());
  const allowed = new Set(text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean));
  const { mountUploadPanel } = await import(browser.runtime.getURL('extension/embedded-upload.mjs'));
  mountUploadPanel(document, browser.runtime);
  let busy = false;
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('index.html'))) return;
    if (message?.type === 'cake-tagger:inspect') return Promise.resolve(inspectUploads(document).map(({ id, filename, tags }) => ({ id, filename, tags })));
    if (message?.type !== 'cake-tagger:append' || typeof message.filename !== 'string') return;
    if (busy) return Promise.resolve({ error: 'Eine Tag-Übernahme läuft bereits.' });
    busy = true;
    return appendTags(document, message.filename, message.tags, allowed)
      .catch(e => ({ error: e.message }))
      .finally(() => { busy = false; });
  });
})();
