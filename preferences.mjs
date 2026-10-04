export const SETTINGS_KEY = 'cake-tagger-settings-v1';
export const DEFAULT_SETTINGS = Object.freeze({ language: 'auto', uploadLayout: 'cards', frames: 'auto', parallelism: 'auto', excludedTags: Object.freeze(['hairy', 'watermark']), showScores: true, showUncertain: true, autoAnalyzeEmbed: true });
export function normalizeSettings(value = {}) {
  // This allowlist is also the persistence boundary: unrelated fields are discarded.
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const frames = String(value.frames ?? 'auto');
  return {
    language: ['auto', 'de', 'en'].includes(value.language) ? value.language : 'auto',
    uploadLayout: ['cards','sidebar'].includes(value.uploadLayout) ? value.uploadLayout : 'cards',
    frames: ['auto', '4', '6', '8', '12', '16', '24', '32', '48'].includes(frames) ? frames : 'auto',
    parallelism: /^[1-9]\d*$/.test(String(value.parallelism)) && Number.isSafeInteger(Number(value.parallelism)) ? String(value.parallelism) : 'auto',
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

export function createSettingsStore({ storage, events, request } = {}) {
  if (typeof request !== 'function') throw Error('A backend settings transport is required.');
  const listeners = new Set();
  let current = normalizeSettings();
  function accept(value) {
    const next = normalizeSettings(value);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next; for (const listener of listeners) listener(normalizeSettings(current));
  }
  async function load() {
    if (request) {
      let response = await request('get');
      if (!response.initialized && storage) {
        let legacy; try { legacy = JSON.parse(storage.getItem(SETTINGS_KEY)); } catch {}
        if (legacy) response = await request('set', normalizeSettings(legacy));
      }
      accept(response.settings);
    }
    return normalizeSettings(current);
  }
  async function save(value) {
    const next = normalizeSettings(value);
    if (request) {
      const response = await request('set', next); accept(response.settings);
    }
    return normalizeSettings(current);
  }
  events?.addEventListener('storage', event => {
    if (event.key !== SETTINGS_KEY) return;
    if (request) { load().catch(() => {}); return; }

  });
  return { load, save, get: () => normalizeSettings(current), subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
