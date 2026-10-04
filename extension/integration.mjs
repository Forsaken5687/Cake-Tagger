import { isFileMessage } from './message-contract.mjs';
import { message, messageError, errorMessage } from '../messages.mjs';
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
    document.querySelector('#upload-title').dataset.i18n = 'analysis.title'; document.querySelector('#upload-title').textContent = t('analysis.title');
    document.querySelector('.results-heading h2').dataset.i18n = 'results.suggestions'; document.querySelector('.results-heading h2').textContent = t('results.suggestions');
    window.addEventListener('message', event => {
      if (isThemeMessage(event, parent, CAKE_ORIGIN, channel)) applyTheme(event.data.theme);
      if (isFileMessage(event, parent, CAKE_ORIGIN, channel, File)) receiveFiles(event.data.files);
    });
    if (!Number.isInteger(embeddedTab) || embeddedTab <= 0) browser.runtime.sendMessage({ type: 'cake-tagger:tab-id' }).then(id => { embeddedTab = id; }).catch(() => {
      localizedText(document.querySelector('#message'), 'error.uploadTabUnavailable');
    });
    parent.postMessage({ type: 'cake-tagger:ready', channel }, CAKE_ORIGIN);
    return;
  }
  const panel = document.createElement('section'); panel.className = 'panel integration-panel';
  const title = document.createElement('h2'); localizedText(title, 'transfer.title');
  const label = document.createElement('label'); const labelText = document.createElement('span'); localizedText(labelText, 'transfer.tab'); label.append(labelText);
  select = document.createElement('select'); select.dataset.i18nAriaLabel = 'transfer.tabLabel'; select.setAttribute('aria-label', t('transfer.tabLabel'));
  refresh = document.createElement('button'); refresh.className = 'quiet'; localizedText(refresh, 'transfer.refresh');
  const note = document.createElement('p'); localizedText(note, 'transfer.hint');
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
    if (!tabs.length) { const option = document.createElement('option'); option.value = ''; localizedText(option, 'transfer.noTab'); select.append(option); }
  } catch { localizedText(document.querySelector('#message'), 'error.sitePermission'); }
}

export function integrationButton(entry, makeElement, showMessage) {
  if (!isExtension) return null;
  const button = makeElement('button', 'transfer.apply', 'quiet'); button.type = 'button';
  button.onclick = async () => {
    if (busy) return;
    const tags = [...entry.selected].filter(([, enabled]) => enabled).map(([tag]) => tag);
    if (!tags.length) return showMessage('error.noSelectedTags');
    const tabId = Number(embedded ? embeddedTab : select.value);
    if (!Number.isInteger(tabId) || tabId <= 0) return showMessage('error.chooseTab');
    busy = true; button.disabled = true;
    try {
      const response = await browser.runtime.sendMessage({ type: 'cake-tagger:transfer', tabId, filename: entry.file.name, tags });
      if (!response) throw messageError('error.reloadUploadForm');
      showMessage(response.error || message(response.added.length === 1 ? 'transfer.completeSingle' : 'transfer.complete', { count: response.added.length, skipped: response.skipped.length }));
    } catch (e) { showMessage(message('error.transferFailed', { error: errorMessage(e) })); }
    finally { busy = false; button.disabled = false; }
  };
  return button;
}
