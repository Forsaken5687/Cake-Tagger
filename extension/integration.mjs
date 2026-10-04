import { t, localizedText } from '../i18n.mjs';
import { applySiteTheme, isThemeMessage } from './site-theme.mjs';
export const isExtension = ['moz-extension:', 'chrome-extension:'].includes(location.protocol);
let select, refresh, busy = false;
let embeddedTab = Number(new URL(location.href).searchParams.get('target'));
const embedded = new URL(location.href).searchParams.get('embedded') === '1';
const channel = new URL(location.href).searchParams.get('channel');
const CAKE_ORIGIN = 'https://cake.ski';

export function installIntegration(receiveFiles, onTheme = () => {}) {
  if (!isExtension) return;
  let lastTheme;
  const applyTheme = value => {
    if (JSON.stringify(value) === lastTheme) return;
    const theme = applySiteTheme(document, value);
    if (theme) { lastTheme = JSON.stringify(value); onTheme(theme); }
  };
  const requestTheme = async () => {
    const tabId = Number(embedded ? embeddedTab : select?.value);
    if (Number.isInteger(tabId) && tabId > 0) {
      try {
        const theme = await browser.runtime.sendMessage({ type: 'cake-tagger:get-theme', tabId });
        if (tabId === Number(embedded ? embeddedTab : select?.value)) applyTheme(theme);
      } catch {}
    }
  };
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === browser.runtime.id && message?.type === 'cake-tagger:site-theme-updated' && message.tabId === Number(embedded ? embeddedTab : select?.value)) applyTheme(message.theme);
  });
  window.addEventListener('focus', requestTheme);
  document.querySelector('#quit').hidden = true;
  if (embedded && channel) {
    document.body.classList.add('embedded');
    document.querySelector('#upload-title').dataset.i18n = 'Analysis'; document.querySelector('#upload-title').textContent = t('Analysis');
    document.querySelector('.results-heading h2').dataset.i18n = 'Suggestions'; document.querySelector('.results-heading h2').textContent = t('Suggestions');
    window.addEventListener('message', event => {
      if (isThemeMessage(event, parent, CAKE_ORIGIN, channel)) applyTheme(event.data.theme);
      if (isFileMessage(event, parent, CAKE_ORIGIN, channel, File)) receiveFiles(event.data.files);
    });
    if (!Number.isInteger(embeddedTab) || embeddedTab <= 0) browser.runtime.sendMessage({ type: 'cake-tagger:tab-id' }).then(id => { embeddedTab = id; }).catch(() => {
      localizedText(document.querySelector('#message'), 'Upload tab unavailable. Please reload cake.ski.');
    });
    parent.postMessage({ type: 'cake-tagger:ready', channel }, CAKE_ORIGIN);
    return;
  }
  const panel = document.createElement('section'); panel.className = 'panel integration-panel';
  const title = document.createElement('h2'); title.dataset.i18n = 'Connect cake.ski'; title.textContent = t('Connect cake.ski');
  const label = document.createElement('label'); const labelText = document.createElement('span'); labelText.dataset.i18n = 'Upload tab'; labelText.textContent = t('Upload tab'); label.append(labelText);
  select = document.createElement('select'); select.dataset.i18nAriaLabel = 'cake.ski upload tab'; select.setAttribute('aria-label', t('cake.ski upload tab'));
  refresh = document.createElement('button'); refresh.className = 'quiet'; refresh.dataset.i18n = 'Refresh tabs'; refresh.textContent = t('Refresh tabs');
  const note = document.createElement('p'); note.dataset.i18n = 'Choose the same videos on cake.ski, then add reviewed tags for each file.'; note.textContent = t('Choose the same videos on cake.ski, then add reviewed tags for each file.');
  label.append(select); panel.append(title, label, refresh, note);
  document.querySelector('#message').before(panel);
  select.onchange = requestTheme;
  refresh.onclick = async () => { await refreshTabs(); await requestTheme(); };
  refresh.onclick();
}

async function refreshTabs() {
  const previous = select.value || new URL(location.href).searchParams.get('target');
  select.replaceChildren();
  try {
    const tabs = await browser.runtime.sendMessage({ type: 'cake-tagger:list-tabs' });
    for (const tab of tabs) {
      const option = document.createElement('option'); option.value = String(tab.id); option.textContent = tab.title || 'cake.ski'; select.append(option);
    }
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    if (!tabs.length) { const option = document.createElement('option'); option.value = ''; localizedText(option, 'No cake.ski tab open'); select.append(option); }
  } catch { localizedText(document.querySelector('#message'), 'Please allow the extension to access cake.ski.'); }
}

export function integrationButton(entry, makeElement, showMessage) {
  if (!isExtension) return null;
  const button = makeElement('button', 'Apply tags', 'quiet'); button.type = 'button';
  button.onclick = async () => {
    if (busy) return;
    const tags = [...entry.selected].filter(([, enabled]) => enabled).map(([tag]) => tag);
    if (!tags.length) return showMessage('Please select at least one tag.');
    const tabId = Number(embedded ? embeddedTab : select.value);
    if (!Number.isInteger(tabId) || tabId <= 0) return showMessage('Please choose a cake.ski tab.');
    busy = true; button.disabled = true;
    try {
      const response = await browser.runtime.sendMessage({ type: 'cake-tagger:transfer', tabId, filename: entry.file.name, tags });
      if (!response) throw Error('Upload form unavailable. Reload cake.ski after loading the extension.');
      showMessage(response.error || `${response.added.length} tags added · ${response.skipped.length} already present or excluded.`);
    } catch (e) { showMessage('Transfer failed: ' + e.message); }
    finally { busy = false; button.disabled = false; }
  };
  return button;
}
import { isFileMessage } from './message-contract.mjs';
