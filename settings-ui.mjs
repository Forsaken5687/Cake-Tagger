import { message, errorMessage } from './messages.mjs';
import { DEFAULT_SETTINGS } from './preferences.mjs';
import { t, translatePage, localizedText, localizedAttribute } from './i18n.mjs';

export function settingsForm(store, tags, onSaved = () => {}) {
  const form = document.createElement('form'); form.className = 'settings-form';
  let draft = store.get();
  const field = (label, control) => {
    localizedAttribute(control, 'aria-label', label);
    const row = document.createElement('label'); row.className = 'settings-field';
    const text = document.createElement('span'); localizedText(text, label); row.append(text, control); form.append(row); return control;
  };
  const select = options => {
    const control = document.createElement('select');
    for (const [value, label] of options) { const option = document.createElement('option'); option.value = value; localizedText(option, label); control.append(option); }
    return control;
  };
  const language = field('settings.language', select([['auto', 'settings.automatic'], ['de', 'language.de'], ['en', 'language.en']])); language.value = draft.language;
  const frames = field('settings.frames', select([['auto', 'settings.autoFrames'], ...[4,6,8,12,16,24,32,48].map(n => [String(n), message('settings.frameCount', { count: n })])])); frames.value = draft.frames;
  const parallelism = field('settings.parallelism', select([['auto', 'settings.automatic'], ...[1,2,4,6,8].map(count => [String(count), message('settings.parallelismCount', { count })])])); parallelism.value = draft.parallelism;
  const computeHint = document.createElement('p'); localizedText(computeHint, 'settings.parallelismHint'); form.append(computeHint);
  const check = (label, key) => { const input = document.createElement('input'); input.type = 'checkbox'; input.checked = draft[key]; field(label, input).classList.add('settings-check'); return input; };
  const scores = check('settings.scores', 'showScores'), uncertain = check('settings.uncertain', 'showUncertain');
  const autoAnalyze = check('settings.autoAnalyze', 'autoAnalyzeEmbed');
  const exclusions = document.createElement('section'); exclusions.className = 'settings-exclusions';
  const title = document.createElement('h3'); localizedText(title, 'settings.exclusions');
  const hint = document.createElement('p'); localizedText(hint, 'settings.exclusionsHint');
  const chips = document.createElement('div'); chips.className = 'settings-excluded-tags';
  const add = document.createElement('div'); add.className = 'tag-add';
  const search = document.createElement('input'); search.type = 'text'; localizedAttribute(search, 'placeholder', 'settings.searchTags'); localizedAttribute(search, 'aria-label', 'settings.excludeTag');
  const list = document.createElement('datalist'); list.id = 'settings-tag-list-' + Math.random().toString(36).slice(2); search.setAttribute('list', list.id);
  for (const tag of tags) { const option = document.createElement('option'); option.value = tag; list.append(option); }
  const addButton = document.createElement('button'); addButton.type = 'button'; addButton.className = 'quiet'; localizedText(addButton, 'action.add');
  const status = document.createElement('p'); status.className = 'settings-status'; status.setAttribute('role', 'status');
  function renderExclusions() {
    chips.replaceChildren();
    for (const tag of draft.excludedTags) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet small-button'; button.textContent = tag + ' ×'; localizedAttribute(button, 'aria-label', 'settings.removeExclusion', { tag });
      button.onclick = () => { draft.excludedTags = draft.excludedTags.filter(value => value !== tag); renderExclusions(); };
      chips.append(button);
    }
  }
  addButton.onclick = () => {
    const tag = tags.find(value => value.toLowerCase() === search.value.trim().toLowerCase());
    if (!tag) { localizedText(status, 'error.chooseExclusion'); return; }
    draft.excludedTags = [...new Set([...draft.excludedTags, tag])]; search.value = ''; localizedText(status, ''); renderExclusions(); search.focus();
  };
  search.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); addButton.click(); } };
  add.append(search, addButton, list); exclusions.append(title, hint, chips, add); form.append(exclusions);
  const actions = document.createElement('div'); actions.className = 'settings-actions';
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'quiet'; localizedText(reset, 'action.defaults');
  const save = document.createElement('button'); save.type = 'submit'; localizedText(save, 'action.save');
  reset.onclick = () => { draft = { ...DEFAULT_SETTINGS, excludedTags: [...DEFAULT_SETTINGS.excludedTags] }; language.value = draft.language; frames.value = draft.frames; parallelism.value = draft.parallelism; scores.checked = draft.showScores; uncertain.checked = draft.showUncertain; autoAnalyze.checked = draft.autoAnalyzeEmbed; renderExclusions(); localizedText(status, ''); };
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = reset.disabled = true;
    try {
      await store.save({ ...draft, language: language.value, frames: frames.value, parallelism: parallelism.value, showScores: scores.checked, showUncertain: uncertain.checked, autoAnalyzeEmbed: autoAnalyze.checked });
      onSaved();
    } catch (error) { localizedText(status, errorMessage(error)); }
    finally { save.disabled = reset.disabled = false; }
  };
  actions.append(reset, save); form.append(status, actions); renderExclusions(); return form;
}

export function installSettings(store, tags, embedded) {
  const dialog = document.createElement('dialog'); dialog.id = 'settings-dialog'; dialog.setAttribute('aria-labelledby', 'settings-title');
  const heading = document.createElement('div'); heading.className = 'settings-heading';
  const title = document.createElement('h2'); title.id = 'settings-title'; title.dataset.i18n = 'settings.title';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'quiet small-button'; close.dataset.i18n = 'action.close'; close.onclick = () => dialog.close();
  heading.append(title, close); dialog.append(heading); document.body.append(dialog);
  const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet small-button settings-open'; button.dataset.i18n = 'settings.title';
  (embedded ? document.querySelector('.panel-heading') : document.querySelector('.app-header')).append(button);
  button.onclick = async () => {
    try { await store.load(); } catch { /* Keep usable defaults; saving reports storage errors. */ }
    dialog.querySelector('form')?.remove(); dialog.append(settingsForm(store, tags, () => dialog.close())); translatePage(); dialog.showModal();
  };
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  translatePage();
}
