import test from 'node:test';
import assert from 'node:assert/strict';
import { validatedSessionURL } from '../src/shared/session-url.mjs';
import { validateAnalysisPolicy } from '../src/shared/analysis-settings.mjs';


test('saved sessions reject shell payloads, credentials, alternate hosts and paths', () => {
  const valid = 'http://127.0.0.1:8765/#' + 'a'.repeat(48);
  assert.equal(validatedSessionURL(valid, 8765).href, valid);
  for (const value of [valid + "'; Write-Output injected; #", valid.replace('127.0.0.1', 'localhost'), valid.replace('http:', 'https:'), valid.replace('/#', '/other#'), valid.replace('/#', '/?x=1#'), valid.replace('127.0.0.1', 'user@127.0.0.1'), valid.replace('8765', '9999')]) {
    assert.throws(() => validatedSessionURL(value, 8765));
  }
});

test('analysis policies accept current exclusion snapshots and legacy keys, rejecting malformed metadata', () => {
  for (const value of [null, 'coverage-v7:majority:[]', 'coverage-v2:brief', 'coverage-v5:majority', 'coverage-v6:majority:["hairy","watermark"]', 'coverage-v5:majority:["hairy","watermark"]', 'coverage-v5:majority:[]']) assert.equal(validateAnalysisPolicy(value), value);
  for (const value of [42, 'coverage-v8:majority', 'coverage-v5:unknown', 'coverage-v5:majority:{}', 'coverage-v5:majority:[null]', 'coverage-v5:majority:[', 'coverage-v5:majority:[""]']) assert.throws(() => validateAnalysisPolicy(value));
});
