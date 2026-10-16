import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeSettings } from '../src/shared/preferences.mjs';
import { errorMessage, messageError } from '../src/shared/messages.mjs';

function diagnostics(request) {
  const controls = new Map(['#status', '#report', '#run', '#download'].map(id => [id, {}]));
  const calls = [];
  const dependencies = {
    document: {querySelector: id => controls.get(id)},
    setLanguage() {}, translatePage() {},
    localizedText: (element, key) => { element.textContent = key; },
    errorMessage, messageError, normalizeSettings,
    memorySnapshot: () => ({}),
    createLocalSession: () => ({request}),
    createNativeClient: () => ({infer: async (frames, parallelism) => {
      calls.push(parallelism);
      assert.equal(frames.length, 1);
      return {runtime: {}, timings: {}, scores: [[0]]};
    }}),
    window: {addEventListener() {}}, performance
  };
  const source = fs.readFileSync(new URL('../src/client/diagnostics.mjs', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  new Function(...Object.keys(dependencies), source)(...Object.values(dependencies));
  return {controls, calls, run: () => controls.get('#run').onclick()};
}

test('diagnostics reload saved parallelism for every measurement', async () => {
  let parallelism = '4', requests = 0;
  const page = diagnostics(async url => {
    assert.equal(url, '/api/settings'); requests++;
    return Response.json({settings: {parallelism}});
  });
  await page.run(); parallelism = 'auto'; await page.run();
  assert.deepEqual(page.calls, ['4', 'auto']);
  assert.equal(requests, 2);
  assert.equal(page.controls.get('#download').disabled, false);
  assert.equal(JSON.parse(page.controls.get('#report').textContent).sampledFrames, 1);
});

test('failed settings fetch prevents misleading diagnostic results and allows retry', async () => {
  let failed = true;
  const page = diagnostics(async () => failed ? Response.json({}, {status: 503}) : Response.json({settings: {parallelism: '2'}}));
  await page.run();
  assert.deepEqual(page.calls, []);
  assert.equal(page.controls.get('#download').disabled, true);
  assert.equal(page.controls.get('#run').disabled, false);
  assert.equal(page.controls.get('#status').textContent.key, 'error.nativeServer');
  failed = false; await page.run();
  assert.deepEqual(page.calls, ['2']);
});
