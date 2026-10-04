export const SETTINGS_KEY = 'cake-tagger-settings-v1';
export const DEFAULT_SETTINGS = Object.freeze({ language: 'auto', frames: 'auto', excludedTags: Object.freeze(['hairy', 'watermark']), showScores: true, showUncertain: true, autoAnalyzeEmbed: true });
export function normalizeSettings(value = {}) {
  // This allowlist is also the persistence boundary: unrelated fields are discarded.
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const frames = String(value.frames ?? 'auto');
  return {
    language: ['auto', 'de', 'en'].includes(value.language) ? value.language : 'auto',
    frames: ['auto', '4', '6', '8', '12', '16', '24', '32', '48'].includes(frames) ? frames : 'auto',
    excludedTags: Array.isArray(value.excludedTags) ? [...new Set(value.excludedTags.filter(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.trim().length <= 80).map(tag => tag.trim().toLowerCase()))].slice(0, 258) : [...DEFAULT_SETTINGS.excludedTags],
    showScores: typeof value.showScores === 'boolean' ? value.showScores : true,
    showUncertain: typeof value.showUncertain === 'boolean' ? value.showUncertain : true,
    autoAnalyzeEmbed: typeof value.autoAnalyzeEmbed === 'boolean' ? value.autoAnalyzeEmbed : true
  };
}
export function resolvedLanguage(settings, browserLanguage = 'de') {
  return settings.language === 'auto' ? (browserLanguage.toLowerCase().startsWith('de') ? 'de' : 'en') : settings.language;
}
export function suggestionPolicy(settings) { return JSON.stringify([...settings.excludedTags].sort()); }

export function createSettingsStore({ runtime, storage, events } = {}) {
  const listeners = new Set();
  let current = normalizeSettings();
  function accept(value) {
    const next = normalizeSettings(value);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next; for (const listener of listeners) listener(normalizeSettings(current));
  }
  async function load() {
    if (runtime) {
      const response = await runtime.sendMessage({ type: 'cake-tagger:settings-get' });
      if (!response || response.error) throw Error(response?.error || 'Settings unavailable.');
      accept(response.settings);
    } else {
      let value; try { value = JSON.parse(storage.getItem(SETTINGS_KEY) || 'null'); } catch { value = null; }
      accept(value);
    }
    return normalizeSettings(current);
  }
  async function save(value) {
    const next = normalizeSettings(value);
    if (runtime) {
      const response = await runtime.sendMessage({ type: 'cake-tagger:settings-set', settings: next });
      if (!response || response.error) throw Error(response?.error || 'Settings could not be saved.');
      accept(response.settings);
    } else { storage.setItem(SETTINGS_KEY, JSON.stringify(next)); accept(next); }
    return normalizeSettings(current);
  }
  runtime?.onMessage?.addListener((message, sender) => {
    if (sender.id === runtime.id && message?.type === 'cake-tagger:settings-updated') accept(message.settings);
  });
  events?.addEventListener('storage', event => {
    if (event.key !== SETTINGS_KEY) return;
    try { accept(JSON.parse(event.newValue)); } catch { accept(null); }
  });
  return { load, save, get: () => normalizeSettings(current), subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
