import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chooseTarget, planTags } from '../extension/upload-adapter.mjs';
import { isFileMessage } from '../extension/message-contract.mjs';
test('embedded file transfer accepts only the expected parent origin and session', () => {
  const source = {}, file = new File(['synthetic'], 'test.mp4');
  const event = { source, origin: 'https://cake.ski', data: { type: 'cake-tagger:files', channel: 'session-a', files: [file] } };
  assert.ok(isFileMessage(event, source, 'https://cake.ski', 'session-a', File));
  assert.ok(!isFileMessage({ ...event, source: {} }, source, 'https://cake.ski', 'session-a', File));
  assert.ok(!isFileMessage({ ...event, origin: 'https://example.com' }, source, 'https://cake.ski', 'session-a', File));
  assert.ok(!isFileMessage(event, source, 'https://cake.ski', 'session-b', File));
  assert.ok(!isFileMessage({ ...event, data: { ...event.data, files: [{ name: 'test.mp4' }] } }, source, 'https://cake.ski', 'session-a', File));
});
test('upload matching rejects missing and duplicate filenames without guessing', () => {
  const targets = [{ id: 'a', filename: 'one.m4v' }, { id: 'b', filename: 'two.m4v' }];
  assert.equal(chooseTarget(targets, 'one.m4v').id, 'a');
  assert.throws(() => chooseTarget(targets, 'missing.m4v'));
  assert.throws(() => chooseTarget([...targets, { id: 'c', filename: 'one.m4v' }], 'one.m4v'));
});
test('tag plan preserves inherited tags, exclusions and deduplicates additions', () => {
  const allowed = new Set(['tattoos', 'glasses', 'long hair']);
  assert.deepEqual(planTags(['tattoos', 'glasses', 'long hair', 'long hair'], ['#Tattoos'], ['glasses'], allowed), { add: ['long hair'], skipped: ['tattoos', 'glasses'] });
  assert.throws(() => planTags(['unknown'], [], [], allowed));
  assert.throws(() => planTags('glasses', [], [], allowed));
});
test('Firefox manifest confines page access and declares WASM CSP', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ['https://cake.ski/*']);
  assert.ok(manifest.background.scripts.length);
  assert.equal(manifest.background.service_worker, undefined);
  assert.ok(manifest.content_security_policy.extension_pages.includes("'wasm-unsafe-eval'"));
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.action.default_popup, undefined);
  assert.ok(!manifest.web_accessible_resources[0].resources.some(p => p.startsWith('model/') || p.startsWith('vendor/')));
});
