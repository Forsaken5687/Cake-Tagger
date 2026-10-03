import { DEFAULT_SETTINGS } from './preferences.mjs';
import { t, translatePage } from './i18n.mjs';

export function settingsForm(store, tags, onSaved = () => {}) {
  const form = document.createElement('form'); form.className = 'settings-form';
  let draft = store.get();
  const field = (label, control) => {
    control.setAttribute('aria-label', t(label)); control.setAttribute('data-i18n-aria-label', label);
    const row = document.createElement('label'); row.className = 'settings-field';
    const text = document.createElement('span'); text.dataset.i18n = label; text.textContent = t(label); row.append(text, control); form.append(row); return control;
  };
  const select = options => {
    const control = document.createElement('select');
    for (const [value, label] of options) { const option = document.createElement('option'); option.value = value; option.dataset.i18n = label; option.textContent = t(label); control.append(option); }
    return control;
  };
  const language = field('Sprache', select([['auto', 'Automatisch'], ['de', 'Deutsch'], ['en', 'English']])); language.value = draft.language;
  const frames = field('Bilder pro Video', select([['auto', 'Automatisch nach Videolänge'], ...[4,6,8,12,16,24,32,48].map(n => [String(n), `${n} Bilder`])])); frames.value = draft.frames;
  const check = (label, key) => { const input = document.createElement('input'); input.type = 'checkbox'; input.checked = draft[key]; field(label, input).classList.add('settings-check'); return input; };
  const scores = check('Scores anzeigen', 'showScores'), uncertain = check('Unsichere Vorschläge anzeigen', 'showUncertain');
  const exclusions = document.createElement('section'); exclusions.className = 'settings-exclusions';
  const title = document.createElement('h3'); title.dataset.i18n = 'Ausgeschlossene Tags'; title.textContent = t('Ausgeschlossene Tags');
  const hint = document.createElement('p'); hint.dataset.i18n = 'Gilt für neue automatische Vorschläge. Manuelle Tags und vorhandene Auswahlen bleiben erhalten.'; hint.textContent = t('Gilt für neue automatische Vorschläge. Manuelle Tags und vorhandene Auswahlen bleiben erhalten.');
  const chips = document.createElement('div'); chips.className = 'settings-excluded-tags';
  const add = document.createElement('div'); add.className = 'tag-add';
  const search = document.createElement('input'); search.type = 'text'; search.dataset.i18nPlaceholder = 'Tag suchen …'; search.dataset.i18nAriaLabel = 'Tag ausschließen'; search.placeholder = t('Tag suchen …'); search.setAttribute('aria-label', t('Tag ausschließen'));
  const list = document.createElement('datalist'); list.id = 'settings-tag-list-' + Math.random().toString(36).slice(2); search.setAttribute('list', list.id);
  for (const tag of tags) { const option = document.createElement('option'); option.value = tag; list.append(option); }
  const addButton = document.createElement('button'); addButton.type = 'button'; addButton.className = 'quiet'; addButton.dataset.i18n = 'Hinzufügen'; addButton.textContent = t('Hinzufügen');
  const status = document.createElement('p'); status.className = 'settings-status'; status.setAttribute('role', 'status');
  function renderExclusions() {
    chips.replaceChildren();
    for (const tag of draft.excludedTags) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet small-button'; button.textContent = tag + ' ×'; button.dataset.i18nAriaLabel = 'Ausschluss entfernen: ' + tag; button.setAttribute('aria-label', t('Ausschluss entfernen: ') + tag);
      button.onclick = () => { draft.excludedTags = draft.excludedTags.filter(value => value !== tag); renderExclusions(); };
      chips.append(button);
    }
  }
  addButton.onclick = () => {
    const tag = tags.find(value => value.toLowerCase() === search.value.trim().toLowerCase());
    if (!tag) { status.textContent = t('Bitte einen Tag aus der Liste wählen.'); return; }
    draft.excludedTags = [...new Set([...draft.excludedTags, tag])]; search.value = ''; status.textContent = ''; renderExclusions(); search.focus();
  };
  search.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); addButton.click(); } };
  add.append(search, addButton, list); exclusions.append(title, hint, chips, add); form.append(exclusions);
  const actions = document.createElement('div'); actions.className = 'settings-actions';
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'quiet'; reset.dataset.i18n = 'Standardwerte'; reset.textContent = t('Standardwerte');
  const save = document.createElement('button'); save.type = 'submit'; save.dataset.i18n = 'Speichern'; save.textContent = t('Speichern');
  reset.onclick = () => { draft = { ...DEFAULT_SETTINGS, excludedTags: [...DEFAULT_SETTINGS.excludedTags] }; language.value = draft.language; frames.value = draft.frames; scores.checked = draft.showScores; uncertain.checked = draft.showUncertain; renderExclusions(); status.textContent = ''; };
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = reset.disabled = true;
    try {
      await store.save({ ...draft, language: language.value, frames: frames.value, showScores: scores.checked, showUncertain: uncertain.checked });
      onSaved();
    } catch (error) { status.textContent = t(error.message); }
    finally { save.disabled = reset.disabled = false; }
  };
  actions.append(reset, save); form.append(status, actions); renderExclusions(); return form;
}

export function installSettings(store, tags, embedded) {
  const dialog = document.createElement('dialog'); dialog.id = 'settings-dialog'; dialog.setAttribute('aria-labelledby', 'settings-title');
  const heading = document.createElement('div'); heading.className = 'settings-heading';
  const title = document.createElement('h2'); title.id = 'settings-title'; title.dataset.i18n = 'Einstellungen';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'quiet small-button'; close.dataset.i18n = 'Schließen'; close.onclick = () => dialog.close();
  heading.append(title, close); dialog.append(heading); document.body.append(dialog);
  const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet small-button settings-open'; button.dataset.i18n = 'Einstellungen';
  (embedded ? document.querySelector('.panel-heading') : document.querySelector('.app-header')).append(button);
  button.onclick = async () => {
    try { await store.load(); } catch { /* Keep usable defaults; saving reports storage errors. */ }
    dialog.querySelector('form')?.remove(); dialog.append(settingsForm(store, tags, () => dialog.close())); translatePage(); dialog.showModal();
  };
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  translatePage();
}
