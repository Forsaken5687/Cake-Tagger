import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY, normalizeSettings, resolvedLanguage, createSettingsStore, suggestionPolicy } from '../preferences.mjs';
import { handleSettings } from '../extension/settings-background.mjs';
import { aggregate } from '../tagging.mjs';
import { setLanguage, t } from '../i18n.mjs';

test('preferences normalize corrupt storage and ignore unrelated private fields', () => {
  assert.deepEqual(normalizeSettings(null).excludedTags, ['hairy', 'watermark']);
  const settings = normalizeSettings({ language: 'fr', frames: 1000, excludedTags: [' Hairy ', 'hairy', null, '', 'x'.repeat(81)], showScores: false, token: 'private', items: [{ filename: 'private.mp4' }] });
  assert.equal(settings.language, 'auto'); assert.equal(settings.frames, 'auto');
  assert.deepEqual(settings.excludedTags, ['hairy']); assert.equal(settings.showScores, false);
  assert.equal(settings.token, undefined); assert.equal(settings.items, undefined);
  assert.equal(resolvedLanguage(settings, 'de-DE'), 'de'); assert.equal(resolvedLanguage(settings, 'en-US'), 'en');
  assert.equal(suggestionPolicy(normalizeSettings({ excludedTags: ['hairy', 'watermark'] })), suggestionPolicy(normalizeSettings({ excludedTags: ['watermark', 'hairy'] })));
});

test('standalone settings persist only preferences and recover malformed JSON', async () => {
  const values = new Map([[SETTINGS_KEY, '{broken']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const store = createSettingsStore({ storage }); await store.load();
  await store.save({ language: 'en', frames: '16', excludedTags: ['tattoos'], showScores: false, sessionRecords: ['private'] });
  const reloaded = createSettingsStore({ storage }); const settings = await reloaded.load();
  assert.equal(settings.language, 'en'); assert.equal(settings.frames, '16');
  assert.equal(values.size, 1); assert.equal(JSON.parse(values.get(SETTINGS_KEY)).sessionRecords, undefined);
  const denied = createSettingsStore({ storage: { setItem() { throw Error('Denied'); } } });
  await assert.rejects(denied.save(settings), /Denied/); assert.equal(denied.get().language, 'auto');
});

test('extension settings use a background relay and notify other views without tabs access', async () => {
  const values = {}, broadcasts = [];
  const browser = {
    storage: { local: { get: async () => values, set: async data => Object.assign(values, data) } },
    runtime: { sendMessage: async message => broadcasts.push(message) },
    tabs: { query: async () => [{ id: 42 }], sendMessage: async (id, message) => broadcasts.push({ id, ...message }) }
  };
  let listener;
  const runtime = { id: 'own', sendMessage: message => handleSettings(browser, message), onMessage: { addListener(fn) { listener = fn; } } };
  const store = createSettingsStore({ runtime }); await store.load();
  await store.save({ language: 'en', excludedTags: [], frames: '8' });
  assert.equal(store.get().language, 'en'); assert.deepEqual(store.get().excludedTags, []);
  assert.equal(broadcasts.length, 2); assert.equal(broadcasts[1].id, 42);
  listener({ type: 'cake-tagger:settings-updated', settings: { language: 'de' } }, { id: 'other' });
  assert.equal(store.get().language, 'en');
  listener({ type: 'cake-tagger:settings-updated', settings: { language: 'de' } }, { id: 'own' });
  assert.equal(store.get().language, 'de');
  assert.deepEqual(Object.keys(values), [SETTINGS_KEY]);
});

test('custom exclusions filter both suggestions and uncertain candidates; defaults can be released', () => {
  const frames = Array.from({ length: 8 }, (_, i) => [0.9, 0.9, i < 1 ? 0.8 : 0.1, 0.9]);
  const mapping = { hairy: [0], tattoos: [1], glasses: [2], teen: [3] };
  assert.deepEqual(aggregate(frames, mapping, .4).tags.map(row => row.tag), ['tattoos']);
  const result = aggregate(frames, mapping, .4, 'majority', { excludedTags: ['tattoos', 'glasses'] });
  assert.deepEqual(result.tags.map(row => row.tag), ['hairy']); assert.deepEqual(result.uncertain, []);
  assert.ok(!result.tags.some(row => row.tag === 'teen'));
});

test('language changes translate controls and dynamic analysis messages; tag names stay unchanged', () => {
  setLanguage({ language: 'en' });
  assert.equal(t('settings.title'), 'Settings'); assert.equal(t('settings.frameCount', { count: 16 }), '16 images');
  assert.equal(t('analysis.complete', { count: 16, seconds: 3.2 }), 'Analysis complete · 16 images · 3.2 s · please review');
  assert.equal(t('tattoos'), 'tattoos');
  setLanguage({ language: 'de' }); assert.equal(t('settings.title'), 'Einstellungen');
});
