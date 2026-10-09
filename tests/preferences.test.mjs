import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY, normalizeSettings, resolvedLanguage, createSettingsStore, suggestionPolicy } from '../src/shared/preferences.mjs';

import { aggregate } from '../src/shared/tagging.mjs';
import { setLanguage, t } from '../src/client/i18n.mjs';

test('preferences normalize corrupt storage and ignore unrelated private fields', () => {
  assert.deepEqual(normalizeSettings(null).excludedTags, ['hairy', 'watermark']);
  const settings = normalizeSettings({ language: 'fr', frames: 1000, excludedTags: [' Hairy ', 'hairy', null, '', 'x'.repeat(81)], showScores: false, token: 'private', items: [{ filename: 'private.mp4' }] });
  assert.equal(settings.language, 'auto'); assert.equal(settings.frames, 'auto');
  assert.equal(settings.parallelism, 'auto');
  assert.equal(normalizeSettings({uploadLayout:'sidebar',excludedTags:['tattoos']}).uploadLayout,undefined);
  assert.equal(normalizeSettings({ parallelism: 8 }).parallelism, '8');
  assert.equal(normalizeSettings({ parallelism: 1000 }).parallelism, '1000');
  assert.deepEqual(settings.excludedTags, ['hairy']); assert.equal(settings.showScores, false);
  assert.equal(settings.token, undefined); assert.equal(settings.items, undefined);
  assert.equal(normalizeSettings({parallelImages:true}).parallelImages, undefined);
  assert.equal(resolvedLanguage(settings, 'de-DE'), 'de'); assert.equal(resolvedLanguage(settings, 'en-US'), 'en');
  assert.equal(suggestionPolicy(normalizeSettings({ excludedTags: ['hairy', 'watermark'] })), suggestionPolicy(normalizeSettings({ excludedTags: ['watermark', 'hairy'] })));
});

test('settings share the backend and migrate legacy preferences without modifying the original', async () => {
  const legacy = JSON.stringify({language:'de', parallelism:'16', excludedTags:['tattoos']});
  let saved, writes = 0;
  const request = async (method,value) => {
    if (method === 'set') { saved = normalizeSettings(value); writes++; }
    return {settings:saved || normalizeSettings(), initialized:!!saved};
  };
  const storage = {getItem:() => legacy, setItem:()=> {throw Error('Legacy storage must be preserved');}};
  const local = createSettingsStore({request,storage}), extension = createSettingsStore({request});
  await local.load(); assert.equal(writes,1); assert.equal(local.get().parallelism,'16');
  await extension.load(); assert.deepEqual(extension.get(),local.get());
  await extension.save({...extension.get(),language:'en'}); await local.load();
  assert.equal(local.get().language,'en'); assert.equal(storage.getItem(),legacy);
  const denied=createSettingsStore({request: async()=> {throw Error('Denied');}});
  await assert.rejects(denied.save({language:'de'}),/Denied/);
  assert.equal(denied.get().language,'auto');
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

 test('tag count settings persist through the shared backend and reject invalid limits', async () => {
  let settings = normalizeSettings();
  const store = createSettingsStore({request:async (method,next) => { if(method === 'set')settings=next;return {settings,initialized:true}; }});
  await store.save({...settings,suggestionLimit:7,uncertainLimit:0});
  assert.equal((await store.load()).suggestionLimit,7);assert.equal(store.get().uncertainLimit,0);
  for(const suggestionLimit of [true,'5',0,303,2.5])assert.equal(normalizeSettings({suggestionLimit}).suggestionLimit,20);
  assert.equal(normalizeSettings({suggestionLimit:302}).suggestionLimit,302);
 });

test('suggestion threshold accepts finite scores and retains safe defaults',()=>{
 assert.equal(normalizeSettings({suggestionThreshold:.75}).suggestionThreshold,.75);
 for(const suggestionThreshold of [true,'0.5',NaN,Infinity,-.1,1.1])assert.equal(normalizeSettings({suggestionThreshold}).suggestionThreshold,.4);
});
