(async () => {
  const { inspectUploads, appendTags } = await import(browser.runtime.getURL('extension/upload-adapter.mjs'));
  const text = await fetch(browser.runtime.getURL('tags.txt')).then(r => r.text());
  const allowed = new Set(text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean));
  const { mountUploadPanel } = await import(browser.runtime.getURL('extension/embedded-upload.mjs'));
  mountUploadPanel(document, browser.runtime);
  let busy = false;
  browser.runtime.onMessage.addListener((message, sender) => {
    const trustedBackground = !sender.url || [browser.runtime.getURL('extension/background.js'), browser.runtime.getURL('extension/chrome-worker.mjs'), browser.runtime.getURL('_generated_background_page.html')].includes(sender.url);
    if (sender.id !== browser.runtime.id || !trustedBackground) return;
    if (message?.type === 'cake-tagger:inspect') return Promise.resolve(inspectUploads(document).map(({ id, filename, tags }) => ({ id, filename, tags })));
    if (message?.type !== 'cake-tagger:append' || typeof message.filename !== 'string') return;
    if (busy) return Promise.resolve({ error: 'Eine Tag-Übernahme läuft bereits.' });
    busy = true;
    return appendTags(document, message.filename, message.tags, allowed)
      .catch(e => ({ error: e.message }))
      .finally(() => { busy = false; });
  });
})();
