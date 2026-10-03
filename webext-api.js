// Adapt Chrome callback responses to the Promise-based interface used by Firefox.
if (!globalThis.browser && globalThis.chrome?.runtime?.id) {
  const api = globalThis.chrome;
  globalThis.browser = {
    runtime: {
      id: api.runtime.id,
      getURL: path => api.runtime.getURL(path),
      sendMessage: message => api.runtime.sendMessage(message),
      onMessage: {
        addListener(listener) {
          api.runtime.onMessage.addListener((message, sender, sendResponse) => {
            let response;
            try { response = listener(message, sender); }
            catch (error) { sendResponse({ error: error.message }); return false; }
            if (response === undefined) return false;
            if (response && typeof response.then === 'function') {
              response.then(sendResponse, error => sendResponse({ error: error.message }));
              return true;
            }
            sendResponse(response); return false;
          });
        }
      }
    },
    action: api.action,
    tabs: api.tabs,
    storage: api.storage
  };
}
