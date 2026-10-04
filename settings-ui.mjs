import { message, errorMessage, translate } from './messages.mjs';
import { DEFAULT_SETTINGS, normalizeSettings } from './preferences.mjs';

export function settingsForm(store, tags, onSaved = () => {}, context = {}) {
  const doc = context.document || document;
  const localizedText = (node, key, params) => { node.textContent = translate(key, context.language || 'en', params); return node; };
  const localizedAttribute = (node, attribute, key, params) => { node.setAttribute(attribute, translate(key, context.language || 'en', params)); return node; };
  const form = doc.createElement('form'); form.className = 'settings-form';
  let draft = normalizeSettings(store.get());
  const field = (label, control) => {
    localizedAttribute(control, 'aria-label', label);
    const row = doc.createElement('label'); row.className = 'settings-field';
    const text = doc.createElement('span'); localizedText(text, label); row.append(text, control); form.append(row); return control;
  };
  const select = options => {
    const control = doc.createElement('select');
    for (const [value, label] of options) { const option = doc.createElement('option'); option.value = value; localizedText(option, label); control.append(option); }
    return control;
  };
  const language = field('settings.language', select([['auto', 'settings.automatic'], ['de', 'language.de'], ['en', 'language.en']])); language.value = draft.language;
  const uploadLayout = field('settings.uploadLayout', select([['cards','settings.layoutCards'],['sidebar','settings.layoutSidebar']])); uploadLayout.value = draft.uploadLayout;
  const frames = field('settings.frames', select([['auto', 'settings.autoFrames'], ...[4,6,8,12,16,24,32,48].map(n => [String(n), message('settings.frameCount', { count: n })])])); frames.value = draft.frames;
  const parallelism = doc.createElement('input'); parallelism.type = 'number'; parallelism.min = '1'; parallelism.step = '1';
  parallelism.value = draft.parallelism === 'auto' ? '' : draft.parallelism;
  localizedAttribute(parallelism, 'placeholder', 'settings.automatic'); field('settings.parallelism', parallelism);
  const computeHint = doc.createElement('p'); computeHint.className = 'settings-compute-hint'; form.append(computeHint);
  localizedText(computeHint, 'settings.parallelismHint');
  (context.capabilities ? context.capabilities() : Promise.resolve({})).then(capabilities => {
    if (!Number.isSafeInteger(capabilities.testMaximum)) return;
    parallelism.max = String(capabilities.testMaximum);
    localizedText(computeHint, message('settings.hardwareThreads', { recommended: capabilities.recommendedThreads, maximum: capabilities.testMaximum }));
  }).catch(() => {});
  const check = (label, key) => { const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = draft[key]; field(label, input).classList.add('settings-check'); return input; };
  const scores = check('settings.scores', 'showScores'), uncertain = check('settings.uncertain', 'showUncertain');
  const autoAnalyze = check('settings.autoAnalyze', 'autoAnalyzeEmbed');
  const exclusions = doc.createElement('section'); exclusions.className = 'settings-exclusions';
  const title = doc.createElement('h3'); localizedText(title, 'settings.exclusions');
  const hint = doc.createElement('p'); localizedText(hint, 'settings.exclusionsHint');
  const chips = doc.createElement('div'); chips.className = 'settings-excluded-tags';
  const add = doc.createElement('div'); add.className = 'tag-add';
  const search = doc.createElement('input'); search.type = 'text'; localizedAttribute(search, 'placeholder', 'settings.searchTags'); localizedAttribute(search, 'aria-label', 'settings.excludeTag');
  const list = doc.createElement('datalist'); list.id = 'settings-tag-list-' + Math.random().toString(36).slice(2); search.setAttribute('list', list.id);
  for (const tag of tags) { const option = doc.createElement('option'); option.value = tag; list.append(option); }
  const addButton = doc.createElement('button'); addButton.type = 'button'; addButton.className = 'quiet'; localizedText(addButton, 'action.add');
  const status = doc.createElement('p'); status.className = 'settings-status'; status.setAttribute('role', 'status');
  function renderExclusions() {
    chips.replaceChildren();
    for (const tag of draft.excludedTags) {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'quiet small-button'; button.textContent = tag + ' ×'; localizedAttribute(button, 'aria-label', 'settings.removeExclusion', { tag });
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
  const actions = doc.createElement('div'); actions.className = 'settings-actions';
  const reset = doc.createElement('button'); reset.type = 'button'; reset.className = 'quiet'; localizedText(reset, 'action.defaults');
  const save = doc.createElement('button'); save.type = 'submit'; localizedText(save, 'action.save');
  reset.onclick = () => { draft = { ...DEFAULT_SETTINGS, excludedTags: [...DEFAULT_SETTINGS.excludedTags] }; language.value = draft.language; uploadLayout.value = draft.uploadLayout; frames.value = draft.frames; parallelism.value = ''; scores.checked = draft.showScores; uncertain.checked = draft.showUncertain; autoAnalyze.checked = draft.autoAnalyzeEmbed; renderExclusions(); localizedText(status, ''); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (context.requireTrusted && (!(event instanceof doc.defaultView.Event) || !event.isTrusted)) return;
    save.disabled = reset.disabled = true;
    try {
      await store.save({ ...draft, language: language.value, uploadLayout: uploadLayout.value, frames: frames.value, parallelism: parallelism.value || 'auto', showScores: scores.checked, showUncertain: uncertain.checked, autoAnalyzeEmbed: autoAnalyze.checked });
      onSaved();
    } catch (error) { localizedText(status, errorMessage(error)); }
    finally { save.disabled = reset.disabled = false; }
  };
  actions.append(reset, save); form.append(status, actions); renderExclusions(); return form;
}
