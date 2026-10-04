async function serverService() {
  return globalThis.cakeServer || import(browser.runtime.getURL('extension/server-connection.mjs'));
}
browser.action.onClicked.addListener(async tab => {
 if(tab?.url?.startsWith('https://cake.ski/') && Number.isInteger(tab.id)) {
  await browser.tabs.sendMessage(tab.id,{type:'cake-tagger:open'}).catch(()=>{});
 } else await browser.tabs.create({url:'https://cake.ski/'});
});
browser.runtime.onMessage.addListener((message, sender) => {
  // Only our analysis document and our content script may use the background relay.
  const analysisUrl = browser.runtime.getURL('extension/bridge.html');
  const popup = sender.url === browser.runtime.getURL('extension/popup.html');
  const fromAnalysis = popup || sender.url === analysisUrl || sender.url?.startsWith(analysisUrl + '?');
  const fromCake = sender.url?.startsWith('https://cake.ski/');
  if (sender.id !== browser.runtime.id || (!fromAnalysis && !fromCake)) return;
  if (fromCake && message?.type === 'cake-tagger:site-theme' && Number.isInteger(sender.tab?.id) && message.theme && JSON.stringify(message.theme).length <= 4096) {
    return browser.runtime.sendMessage({ type: 'cake-tagger:site-theme-updated', tabId: sender.tab.id, theme: message.theme }).catch(() => null);
  }
  if (message?.type === 'cake-tagger:settings-get' || (fromAnalysis && message?.type === 'cake-tagger:settings-notify')) {
    return serverService().then(service => message.type === 'cake-tagger:settings-get' ? service.getSettings(browser) : service.notifySettings(browser)).catch(() => ({ error: 'error.nativeServer' }));
  }
  if (fromCake && message?.type === 'cake-tagger:settings-save' && message.settings && JSON.stringify(message.settings).length <= 8192) {
    return serverService().then(service => service.saveSettings(browser, message.settings)).catch(() => ({ error: 'error.requestFailed' }));
  }
  if (fromCake && message?.type === 'cake-tagger:capabilities') return serverService().then(service => service.getCapabilities()).catch(() => ({}));
  if (fromAnalysis && message?.type === 'cake-tagger:connect') return serverService().then(service => service.connect(true)).catch(() => ({ error: 'error.nativeServer' }));
  if (message?.type === 'cake-tagger:tab-id') {
    return Promise.resolve(sender.tab?.id ?? null);
  }
  if(fromCake && message?.type==='cake-tagger:ui-command' && /^[a-f0-9]{32}$/.test(message.channel || '') && Number.isInteger(sender.tab?.id)) {
    const command=message.command;
    if(!command || !['analyze','cancel','export','quit','tag','add','apply'].includes(command.action) || JSON.stringify(command).length>2048)return;
    return browser.runtime.sendMessage({type:'cake-tagger:ui-command-forwarded',channel:message.channel,tabId:sender.tab.id,command}).catch(()=>null);
  }
  if(popup && message?.type==='cake-tagger:quit')return serverService().then(service=>service.stop()).catch(()=>({error:'error.stopFailed'}));
  if(popup && message?.type==='cake-tagger:open-upload')return (async()=>{
    const tabs=await browser.tabs.query({url:'https://cake.ski/*'});
    if(tabs.length){await browser.tabs.update(tabs[0].id,{active:true});await browser.tabs.sendMessage(tabs[0].id,{type:'cake-tagger:open'}).catch(()=>{});}
    else await browser.tabs.create({url:'https://cake.ski/'});return true;
  })();
  if (!fromAnalysis) return;
  if (message?.type === 'cake-tagger:download') {
    // Accept only short-lived export capabilities from our processing bridge.
    // Never let a website choose an arbitrary URL or destination filename.
    if (popup || typeof message.path !== 'string' || message.path.length !== 62 || !/^\/api\/download\/[a-f0-9]{48}$/.test(message.path)) return Promise.resolve({error:'error.requestFailed'});
    return Promise.resolve().then(() => browser.downloads.download({url:'http://127.0.0.1:8765'+message.path, filename:'cake-tags.json', conflictAction:'uniquify'}))
      .then(id => ({started:Number.isInteger(id)})).catch(() => ({error:'error.requestFailed'}));
  }
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
    return Promise.resolve({ error: 'error.invalidTagTransfer' });
  }
  const embedded = new URL(sender.url).searchParams.get('embedded') === '1';
  // An embedded view cannot transfer tags into a different Cake tab.
  if (embedded && sender.tab?.id !== message.tabId) return Promise.resolve({ error: 'error.uploadTabDoesNotMatch' });
  return (async () => {
    try {
      const target = await browser.tabs.get(message.tabId);
      if (!target.url?.startsWith('https://cake.ski/')) return { error: 'error.chooseTab' };
      return await browser.tabs.sendMessage(message.tabId, { type: 'cake-tagger:append', filename: message.filename, tags: message.tags });
    } catch {
      return { error: 'error.uploadFormUnavailable' };
    }
  })();
});
