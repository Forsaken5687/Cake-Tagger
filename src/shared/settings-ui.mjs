import { isTrustedEvent } from './trusted-event.mjs';
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
  const check = (label, key) => { const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = draft[key]; field(label, input).closest('.settings-field').classList.add('settings-check'); return input; };
  const scores = check('settings.scores', 'showScores'), uncertain = check('settings.uncertain', 'showUncertain');
  const limit = (key, label, minimum) => {
    const input = doc.createElement('input'); input.type = 'number'; input.min = String(minimum); input.max = String(tags.length); input.step = '1'; input.required = true; input.value = String(draft[key]); field(label, input); return input;
  };
  const threshold = doc.createElement('input'); threshold.type = 'number'; threshold.min = '0'; threshold.max = '100'; threshold.step = '1'; threshold.required = true; threshold.value = String(Math.round(draft.suggestionThreshold * 100)); field('settings.suggestionThreshold', threshold);
  const thresholdHint = doc.createElement('p'); localizedText(thresholdHint, 'settings.thresholdHint'); form.append(thresholdHint);
  const suggestionLimit = limit('suggestionLimit', 'settings.suggestionLimit', 1);
  const uncertainLimit = limit('uncertainLimit', 'settings.uncertainLimit', 0);
  const limitHint = doc.createElement('p'); localizedText(limitHint, 'settings.limitHint'); form.append(limitHint);
  const autoAnalyze = check('settings.autoAnalyze', 'autoAnalyzeEmbed');
  const hideSiteAI = check('settings.hideSiteAI', 'hideSiteAI');
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
  reset.onclick = () => { draft = { ...DEFAULT_SETTINGS, excludedTags: [...DEFAULT_SETTINGS.excludedTags] }; language.value = draft.language; frames.value = draft.frames; parallelism.value = ''; threshold.value = String(Math.round(draft.suggestionThreshold * 100)); suggestionLimit.value = String(draft.suggestionLimit); uncertainLimit.value = String(draft.uncertainLimit); scores.checked = draft.showScores; uncertain.checked = draft.showUncertain; autoAnalyze.checked = draft.autoAnalyzeEmbed; hideSiteAI.checked = draft.hideSiteAI; renderExclusions(); localizedText(status, ''); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (context.requireTrusted && !isTrustedEvent(event)) return;
    save.disabled = reset.disabled = true;
    try {
      await store.save({ ...draft, language: language.value, frames: frames.value, parallelism: parallelism.value || 'auto', suggestionThreshold: Number(threshold.value) / 100, suggestionLimit: Number(suggestionLimit.value), uncertainLimit: Number(uncertainLimit.value), showScores: scores.checked, showUncertain: uncertain.checked, autoAnalyzeEmbed: autoAnalyze.checked, hideSiteAI: hideSiteAI.checked });
      onSaved();
    } catch (error) { localizedText(status, errorMessage(error)); }
    finally { save.disabled = reset.disabled = false; }
  };
  // Keep the scrollable settings separate from the always-reachable actions.
  const body = doc.createElement('div'); body.className = 'settings-body';
  const group = (key, controls, notes = []) => {
    const section = doc.createElement('fieldset'); section.className = 'settings-group';
    const legend = doc.createElement('legend'); localizedText(legend, key); section.append(legend);
    for (const control of controls) section.append(control.closest('.settings-field'));
    section.append(...notes); body.append(section);
  };
  group('settings.generalGroup', [language, autoAnalyze, hideSiteAI]);
  group('settings.analysisGroup', [frames, parallelism], [computeHint]);
  const explanation = doc.createElement('details'); explanation.className = 'settings-help';
  const summary = doc.createElement('summary'); localizedText(summary, 'settings.thresholdHelp');
  explanation.append(summary, thresholdHint);
  group('settings.suggestionsGroup', [suggestionLimit, uncertainLimit, threshold, scores, uncertain], [explanation, limitHint]);
  body.append(exclusions);
  const footer = doc.createElement('div'); footer.className = 'settings-footer';
  actions.append(reset, save); footer.append(status, actions);
  form.replaceChildren(body, footer); renderExclusions(); return form;
}
