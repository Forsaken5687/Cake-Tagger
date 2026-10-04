import { translate, errorMessage } from '../messages.mjs';
let language = navigator.language.startsWith('de') ? 'de' : 'en';
const t = key => translate(key, language);
const status = document.querySelector('#status');
const open = document.querySelector('#open'), quit = document.querySelector('#quit');
function render() { open.textContent = t('embed.openButton'); quit.textContent = t('action.quit'); }
render();
// Share the application's saved language preference; Automatic uses browser UI language.
browser.runtime.sendMessage({ type: 'cake-tagger:settings-get' }).then(response => {
  if (['en', 'de'].includes(response?.settings?.language)) language = response.settings.language;
  render();
}).catch(() => {});
open.onclick = async () => {
  try { await browser.runtime.sendMessage({ type: 'cake-tagger:open-upload' }); window.close(); }
  catch (error) { status.textContent = t(errorMessage(error)); }
};
quit.onclick = async () => {
  quit.disabled = true;
  try {
    const result = await browser.runtime.sendMessage({ type: 'cake-tagger:quit' });
    if (!result?.stopped) throw Error(result?.error || 'error.stopFailed');
    status.textContent = t('analysis.stopped'); open.disabled = true;
  } catch { status.textContent = t('error.stopFailed'); quit.disabled = false; }
};
