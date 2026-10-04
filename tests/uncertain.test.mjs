import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../src/shared/tagging.mjs';
import { applyRecord, makeRecord, validateRecord, exportItem } from '../src/shared/corrections.mjs';

test('uncertain candidates have real scores, stay unchecked and preserve existing choices', () => {
  const result = { ...aggregate([[0.9], [0.7], [0.1], [0.1]], { piercings: [0] }, 0.4), sha256: 'd'.repeat(64), sampledFrames: 4, model: 'JoyTag-INT8', analysisPolicy: 'coverage-v5:majority' };
  // Use an action label to fail temporal coverage rather than detail coverage.
  const action = aggregate([[0.9], [0.7], [0.1], [0.1]], { solo: [0] }, 0.4);
  assert.deepEqual(action.tags, []);
  assert.equal(action.uncertainScores[0].confidence, 0.8);
  assert.equal(action.uncertainScores[0].supportingFrames, 2);
  const baseline = { ...result, ...action };
  const record = { filename: 'synthetic.mp4', sha256: result.sha256, tags: ['piercings'], candidateTags: ['piercings'], tagSources: { piercings: 'manual' }, reviewed: true, originalSuggestionsKnown: true, result: baseline };
  const entry = applyRecord({ file: { name: record.filename } }, record);
  assert.equal(entry.selected.get('solo'), false);
  assert.equal(entry.selected.get('piercings'), true);
  assert.equal(entry.tagSources.solo, 'suggestion');
  assert.equal(entry.tagSources.piercings, 'manual');
  assert.equal(entry.reviewed, true);
  const saved = validateRecord(makeRecord(entry), ['solo', 'piercings']);
  assert.deepEqual(exportItem(applyRecord({ file: entry.file }, saved)).uncertainScores, action.uncertainScores);
  assert.throws(() => validateRecord({ ...saved, result: { ...saved.result, uncertainScores: [{ tag: 'solo', confidence: NaN, supportingFrames: 0 }] } }, ['solo', 'piercings']));
  const legacy = applyRecord({ file: entry.file }, { ...record, result: { ...baseline, uncertainScores: undefined } });
  assert.equal(legacy.selected.get('solo'), false);
  assert.equal(exportItem(legacy).uncertainScores, null);
});
