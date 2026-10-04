import { messageError } from './messages.mjs';

// Only the same-origin local page can request this handshake. External websites
// cannot reproduce its Origin plus custom header through an approved preflight.
export function createLocalSession({ fetcher = fetch, storage = sessionStorage, address = location, navigation = history } = {}) {
  let token = address.hash.slice(1) || storage.getItem('cake-token') || '', connecting;
  if (address.hash) { storage.setItem('cake-token', token); navigation.replaceState(null, '', address.pathname + address.search); }
  async function connect() {
    if (!connecting) connecting = (async () => {
      const response = await fetcher('/api/connect', {method:'POST', headers:{'X-Cake-Tagger-Client':'local'}, signal:AbortSignal.timeout(3000)});
      const data = await response.json();
      if (!response.ok || !/^[a-f0-9]{48}$/.test(data.token)) throw messageError('error.nativeServer');
      token = data.token; storage.setItem('cake-token',token);
    })().finally(() => { connecting = undefined; });
    return connecting;
  }
  async function request(url, options = {}) {
    if (!token) await connect();
    const send = () => fetcher(url, {...options, headers:{...options.headers, Authorization:'Bearer '+token}});
    let response = await send();
    // Authentication fails before the backend admits any job or mutation.
    // Retry only that rejection, never a failed or interrupted analysis.
    if (response.status === 401) { await connect(); response = await send(); }
    return response;
  }
  return {request};
}
