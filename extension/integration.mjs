export const isExtension = location.protocol === 'moz-extension:';
let select, refresh, busy = false;
let embeddedTab = Number(new URL(location.href).searchParams.get('target'));
const embedded = new URL(location.href).searchParams.get('embedded') === '1';
const channel = new URL(location.href).searchParams.get('channel');
const CAKE_ORIGIN = 'https://cake.ski';

export function installIntegration(receiveFiles) {
  if (!isExtension) return;
  document.querySelector('#quit').hidden = true;
  if (embedded && channel) {
    document.body.classList.add('embedded');
    document.querySelector('#upload-title').textContent = 'Analyse';
    document.querySelector('.results-heading h2').textContent = 'Tag-Auswahl';
    window.addEventListener('message', event => {
      if (isFileMessage(event, parent, CAKE_ORIGIN, channel, File)) receiveFiles(event.data.files);
    });
    if (!Number.isInteger(embeddedTab) || embeddedTab <= 0) browser.runtime.sendMessage({ type: 'cake-tagger:tab-id' }).then(id => { embeddedTab = id; }).catch(() => {
      document.querySelector('#message').textContent = 'Upload-Tab nicht erreichbar. Bitte cake.ski neu laden.';
    });
    parent.postMessage({ type: 'cake-tagger:ready', channel }, CAKE_ORIGIN);
    return;
  }
  const panel = document.createElement('section'); panel.className = 'panel integration-panel';
  const title = document.createElement('h2'); title.textContent = 'cake.ski verbinden';
  const label = document.createElement('label'); label.textContent = 'Upload-Tab';
  select = document.createElement('select'); select.setAttribute('aria-label', 'cake.ski Upload-Tab');
  refresh = document.createElement('button'); refresh.className = 'quiet'; refresh.textContent = 'Tabs aktualisieren';
  const note = document.createElement('p'); note.textContent = 'Dieselben Videos auf cake.ski auswählen, dann die geprüften Tags pro Datei ergänzen.';
  label.append(select); panel.append(title, label, refresh, note);
  document.querySelector('#message').before(panel);
  refresh.onclick = refreshTabs;
  refreshTabs();
}

async function refreshTabs() {
  const previous = select.value || new URL(location.href).searchParams.get('target');
  select.replaceChildren();
  try {
    const tabs = await browser.tabs.query({ url: 'https://cake.ski/*' });
    for (const tab of tabs) {
      const option = document.createElement('option'); option.value = String(tab.id); option.textContent = tab.title || 'cake.ski'; select.append(option);
    }
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    if (!tabs.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'Kein cake.ski-Tab geöffnet'; select.append(option); }
  } catch { document.querySelector('#message').textContent = 'Bitte der Erweiterung Zugriff auf cake.ski erlauben.'; }
}

export function integrationButton(entry, makeElement, showMessage) {
  if (!isExtension) return null;
  const button = makeElement('button', 'Tags auf cake.ski ergänzen', 'quiet'); button.type = 'button';
  button.onclick = async () => {
    if (busy) return;
    const tags = [...entry.selected].filter(([, enabled]) => enabled).map(([tag]) => tag);
    if (!tags.length) return showMessage('Bitte mindestens einen Tag auswählen.');
    const tabId = Number(embedded ? embeddedTab : select.value);
    if (!Number.isInteger(tabId) || tabId <= 0) return showMessage('Bitte einen cake.ski-Tab auswählen.');
    busy = true; button.disabled = true;
    try {
      const response = await browser.tabs.sendMessage(tabId, { type: 'cake-tagger:append', filename: entry.file.name, tags });
      if (!response) throw Error('Upload-Formular nicht erreichbar. cake.ski nach dem Laden der Erweiterung neu laden.');
      showMessage(response.error || `${response.added.length} Tags ergänzt · ${response.skipped.length} bereits vorhanden oder ausgeschlossen.`);
    } catch (e) { showMessage('Übernahme fehlgeschlagen: ' + e.message); }
    finally { busy = false; button.disabled = false; }
  };
  return button;
}
import { isFileMessage } from './message-contract.mjs';
