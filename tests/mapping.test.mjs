import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mappingGroups } from '../src/shared/tagging.mjs';
import { readTags, excluded } from '../src/shared/tag-policy.mjs';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('all mappings address valid labels and coverage matches the active policy', () => {
  const mapping = JSON.parse(read('model/mapping.json'));
  const labels = read('model/top_tags.txt').trimEnd().split(/\r?\n/);
  const tags = readTags(read('model/tags.txt'));
  for (const [tag, indices] of Object.entries(mapping)) {
    assert(tags.includes(tag), tag);
    assert(mappingGroups(indices).every(group => group.length > 0), tag);
    for (const index of mappingGroups(indices).flat()) assert(Number.isInteger(index) && index >= 0 && index < labels.length, tag);
  }
  assert.equal(mapping.watermark, undefined);
  assert.deepEqual(mapping.closeup.map(i => labels[i]), ['close-up']);
  assert.deepEqual(mapping.kissing.map(i => labels[i]), ['kiss', 'french_kiss']);
  assert.deepEqual(mapping.shower.map(i => labels[i]), ['showering']);
  assert.deepEqual(mapping.sweaty.map(i => labels[i]), ['sweat', 'sweating_profusely']);
  const coverage = JSON.parse(read('model/coverage.json'));
  assert.deepEqual(coverage.supported, tags.filter(tag => mapping[tag] && !excluded.has(tag)));
  assert.deepEqual(coverage.manualOnly, tags.filter(tag => !coverage.supported.includes(tag)));
  assert.equal(coverage.supportedCount, coverage.supported.length);
  assert.equal(coverage.totalCount, tags.length);
});

test('mapping audit covers every tag with exact sources or an explicit reason', () => {
  const mapping = JSON.parse(read('model/mapping.json'));
  const labels = read('model/top_tags.txt').trimEnd().split(/\r?\n/);
  const coverage = JSON.parse(read('model/coverage.json'));
  assert.deepEqual(coverage.entries.map(e => e.tag), readTags(read('model/tags.txt')));
  for (const entry of coverage.entries) {
    assert.deepEqual(entry.labels, mapping[entry.tag] ? mappingGroups(mapping[entry.tag]).flat().map(i => labels[i]) : []);
    if (entry.status !== 'automatic') assert(entry.reason?.length > 0, entry.tag);
  }
  for (const tag of ['shaved', 'no face', 'oiled', 'stockings', 'clown', 'hair pull', 'caption', 'solo male']) assert.equal(mapping[tag], undefined, tag);
  const sources = tag => mapping[tag].map(i => labels[i]);
  assert.deepEqual(sources('stripping'), ['undressing']);
  assert.deepEqual(sources('chubby'), ['plump']);
  assert.deepEqual(sources('slime'), ['slime_(substance)']);
  assert(sources('sex toy').includes('dildo'));
  assert(sources('underwear').includes('bra'));
  assert(sources('tattoos').includes('stomach_tattoo'));
  assert.deepEqual(mappingGroups(mapping.sloppy).map(group => group.map(i => labels[i])), [['fellatio', 'deepthroat'], ['saliva', 'saliva_trail', 'drooling', 'mouth_drool']]);
  assert.deepEqual(coverage.entries.find(e => e.tag === 'sloppy').all, mappingGroups(mapping.sloppy).map(group => group.map(i => labels[i])));
  assert(coverage.entries.find(e => e.tag === 'public').scope);
  assert(coverage.entries.find(e => e.tag === 'changing room').scope);
});

test('production model download and provenance identify the same official FP32 artifact', () => {
  const assets = JSON.parse(read('scripts/assets.json'));
  const provenance = JSON.parse(read('model/provenance.json'));
  const models = assets.assets.filter(asset => asset.path.endsWith('.onnx'));
  assert.equal(models.length, 1);
  assert.equal(models[0].path, 'model/joytag.onnx');
  assert.equal(provenance.repository, 'fancyfeast/joytag');
  assert.equal(provenance.precision, 'float32');
  assert.equal(provenance.name, 'JoyTag-FP32');
  assert.equal(models[0].sha256, provenance.sha256);
  assert.equal(models[0].url, `https://huggingface.co/${provenance.repository}/resolve/${provenance.revision}/${provenance.file}`);
  assert.equal(provenance.runtime, 'onnxruntime@1.30.0');
  assert.equal(provenance.runtimeWheelSha256, assets.python.wheels.find(asset => asset.name === 'onnxruntime').sha256);
});

test('current website names replace retired names and new tags use explicit labels', () => {
  const tags = readTags(read('model/tags.txt'));
  const mapping = JSON.parse(read('model/mapping.json'));
  const labels = read('model/top_tags.txt').trimEnd().split(/\r?\n/);
  const sources = tag => mapping[tag].map(i => labels[i]);
  for (const tag of ['supine', 'side fuck', 'couch', 'League of Legends', 'ai-tagged-bare', 'ai-needs-review']) assert(!tags.includes(tag), tag);
  assert.deepEqual(sources('lying on back'), ['on_back']);
  assert.deepEqual(sources('lying on side'), ['on_side']);
  assert.deepEqual(sources('league of legends'), ['league_of_legends']);
  assert.deepEqual(sources('multicolored hair'), ['multicolored_hair']);
  assert.deepEqual(sources('covering breasts'), ['covering_breasts']);
  for (const tag of ['4:3', 'ai tagged', 'ai tagged bare', 'ai needs review', 'ksjhgf', 'tightjob']) assert(excluded.has(tag), tag);
});
