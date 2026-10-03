import test from 'node:test';
import assert from 'node:assert/strict';
import { createUploadAutoAnalysis } from '../extension/auto-analysis.mjs';
import { normalizeSettings, createSettingsStore } from '../preferences.mjs';
const file = name => ({ name, size: 20, lastModified: 1 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('new upload videos start once; results, corrections, failures and cancellation are not retried', async () => {
  const calls = [], a = file('a.mp4'), b = file('b.mp4'), c = file('c.mp4');
  const corrected = { file: a, result: {}, selected: new Map([['tattoos', false]]) };
  const queue = createUploadAutoAnalysis({ busy: () => false, enabled: () => true,
    prepare: async files => files.map(f => f === a ? corrected : { file: f, error: f === c ? 'Unreadable' : '' }),
    analyze: async entries => calls.push(entries.map(e => e.file.name)) });
  await queue.receive([a, b, c]);
  await queue.receive([a, b, c]);
  await queue.receive([a]);
  assert.deepEqual(calls, [['b.mp4']]);
  assert.equal(corrected.selected.get('tattoos'), false);
});

test('during analysis the latest upload selection wins; removed pending files do not start', async () => {
  const started = deferred(), finish = deferred(), calls = [];
  const a = file('a.mp4'), b = file('b.mp4'), c = file('c.mp4');
  const queue = createUploadAutoAnalysis({ busy: () => false, enabled: () => true,
    prepare: async files => files.map(f => ({ file: f })),
    analyze: async entries => { calls.push(entries.map(e => e.file.name)); if (calls.length === 1) { started.resolve(); await finish.promise; } } });
  const run = queue.receive([a]); await started.promise;
  await queue.receive([a, b]); await queue.receive([a, c]); finish.resolve(); await run;
  assert.deepEqual(calls, [['a.mp4'], ['c.mp4']]);
});

test('preparation changes merge new files; disabling autostart during preparation takes effect', async () => {
  const started = deferred(), finish = deferred(), calls = [];
  const a = file('a.mp4'), b = file('b.mp4'); let count = 0, enabled = true;
  const queue = createUploadAutoAnalysis({ busy: () => false, enabled: () => enabled,
    prepare: async files => { if (++count === 1) { started.resolve(); await finish.promise; } return files.map(f => ({ file: f })); },
    analyze: async entries => calls.push(entries.map(e => e.file.name)) });
  const run = queue.receive([a]); await started.promise; await queue.receive([a, b]); finish.resolve(); await run;
  assert.deepEqual(calls, [['a.mp4', 'b.mp4']]);
  enabled = false; await queue.receive([a, b, file('c.mp4')]);
  assert.equal(calls.length, 1);
});

test('manual analysis delays automatic work; the toggle defaults on and persists off', async () => {
  let busy = true; const calls = [];
  const queue = createUploadAutoAnalysis({ busy: () => busy, enabled: () => true,
    prepare: async files => files.map(f => ({ file: f })), analyze: async entries => calls.push(entries.map(e => e.file.name)) });
  await queue.receive([file('a.mp4')]); assert.equal(calls.length, 0);
  busy = false; await queue.drain(); assert.deepEqual(calls, [['a.mp4']]);
  assert.equal(normalizeSettings().autoAnalyzeEmbed, true);
  assert.equal(normalizeSettings({ autoAnalyzeEmbed: 'false' }).autoAnalyzeEmbed, true);
  let saved;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const store = createSettingsStore({ storage }); await store.save({ autoAnalyzeEmbed: false });
  assert.equal((await createSettingsStore({ storage }).load()).autoAnalyzeEmbed, false);
});
