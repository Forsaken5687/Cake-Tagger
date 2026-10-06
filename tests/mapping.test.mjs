import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readTags, excluded } from '../src/shared/tag-policy.mjs';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('all mappings address valid labels and coverage matches the active policy', () => {
  const mapping = JSON.parse(read('model/mapping.json'));
  const labels = read('model/top_tags.txt').trimEnd().split(/\r?\n/);
  const tags = readTags(read('model/tags.txt'));
  for (const [tag, indices] of Object.entries(mapping)) {
    assert(tags.includes(tag), tag);
    assert(indices.length > 0, tag);
    for (const index of indices) assert(Number.isInteger(index) && index >= 0 && index < labels.length, tag);
  }
  assert.equal(mapping.watermark, undefined);
  assert.deepEqual(mapping.closeup.map(i => labels[i]), ['close-up']);
  assert.deepEqual(mapping.kissing.map(i => labels[i]), ['kiss', 'french_kiss']);
  assert.deepEqual(mapping.shower.map(i => labels[i]), ['showering']);
  assert.deepEqual(mapping.sweaty.map(i => labels[i]), ['sweat', 'sweating_profusely']);
  const coverage = JSON.parse(read('model/coverage.json'));
  assert.deepEqual(coverage.supported, tags.filter(tag => mapping[tag]?.length && !excluded.has(tag)));
  assert.deepEqual(coverage.manualOnly, tags.filter(tag => !coverage.supported.includes(tag)));
  assert.equal(coverage.supportedCount, coverage.supported.length);
  assert.equal(coverage.totalCount, tags.length);
});
