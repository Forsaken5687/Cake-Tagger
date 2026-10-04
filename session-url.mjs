import { messageError } from './messages.mjs';
// Saved session data is untrusted: only reopen this app's exact loopback URL.
export function validatedSessionURL(value, port) {
  const url = new URL(value);
  if (url.origin !== `http://127.0.0.1:${port}` || url.pathname !== '/' || url.search || url.username || url.password || !/^#[a-f0-9]{48}$/.test(url.hash)) {
    throw messageError('error.invalidSessionUrl');
  }
  return url;
}
