import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../src/shared/tagging.mjs';
import { makeRecord, applyRecord, validateRecord, exportItem } from '../src/shared/corrections.mjs';

test('watermark is excluded in both modes but manual selections survive storage and export', () => {
  for (const mode of ['majority', 'brief']) {
    const result = aggregate([[0.99], [0.99], [0.99], [0.99]], { watermark: [0] }, 0.5, mode);
    assert.deepEqual(result.tags, []);
    assert.deepEqual(result.uncertain, []);
    const entry = { file: { name: 'synthetic.mp4' }, selected: new Map([['watermark', true]]), reviewed: true,
      result: { ...result, sha256: 'b'.repeat(64), sampledFrames: 4, model: 'JoyTag-INT8', analysisPolicy: `coverage-v4:${mode}` } };
    const record = validateRecord(makeRecord(entry), ['watermark']);
    const restored = applyRecord({ file: entry.file }, record);
    assert.deepEqual(exportItem(restored).tags, ['watermark']);
    assert.equal(restored.reviewed, true);
  }
});

test('dance requires strong recurring image evidence in both modes', () => {
  for (const mode of ['majority', 'brief']) {
    assert.equal(aggregate([[0.6], [0.6], [0.6], [0.6]], { dance: [0] }, 0.5, mode).tags.length, 0);
    assert.equal(aggregate([[0.8], [0.8], [0.8], [0.1]], { dance: [0] }, 0.5, mode).tags.length, 1);
    assert.equal(aggregate([[0.8], [0.8], [0.8], [0.1]], { dance: [0] }, 0.85, mode).tags.length, 0);
  }
});

test('an isolated high score does not select a tag, even in brief mode', () => {
  const frames = [[0.99], [0.1], [0.1], [0.1]];
  for (const mode of ['majority', 'brief']) {
    const result = aggregate(frames, { solo: [0] }, 0.5, mode);
    assert.equal(result.tags.length, 0);
    assert.deepEqual(result.uncertain, ['solo']);
  }
});
test('eight frames require five matches by default; brief mode preserves two', () => {
  const frames = Array.from({ length: 8 }, (_, i) => [i < 2 ? 0.9 : 0.1, i < 4 ? 0.8 : 0.1, i < 5 ? 0.7 : 0.1]);
  const mapping = { solo: [0], tattoos: [1], glasses: [2] };
  const result = aggregate(frames, mapping, 0.5);
  assert.deepEqual(result.tags.map(x => x.tag), ['glasses']);
  assert.equal(result.tags[0].supportingFrames, 5);
  assert.deepEqual(result.uncertain, ['solo', 'tattoos']);
  assert.deepEqual(aggregate(frames, mapping, 0.5, 'brief').tags.map(x => x.tag), ['solo', 'tattoos', 'glasses']);
});
test('frame count changes the majority requirement and threshold is honored', () => {
  for (const count of [4, 6, 8]) {
    const required = Math.floor(count / 2) + 1;
    const frames = Array.from({ length: count }, (_, i) => [i < required ? 0.5 : 0.1]);
    assert.equal(aggregate(frames, { solo: [0] }, 0.5).tags.length, 1);
    assert.equal(aggregate(frames, { solo: [0] }, 0.65).tags.length, 0);
    frames[required - 1] = [0.1];
    assert.equal(aggregate(frames, { solo: [0] }, 0.5).tags.length, 0);
  }
});
test('hairy remains manual even with consistently high model scores', () => {
  const result = aggregate([[0.99], [0.99], [0.99], [0.99]], { hairy: [0] });
  assert.deepEqual(result.tags, []);
  assert.deepEqual(result.uncertain, []);
  const entry = { file: { name: 'synthetic.mp4' }, selected: new Map([['hairy', true]]), reviewed: true,
    result: { ...result, sha256: 'a'.repeat(64), sampledFrames: 4, threshold: 0.5, model: 'JoyTag-INT8', analysisPolicy: 'coverage-v2:majority' } };
  const record = validateRecord(makeRecord(entry), ['hairy']);
  const restored = applyRecord({ file: entry.file }, record);
  assert.equal(restored.selected.get('hairy'), true);
  assert.equal(exportItem(restored).analysisPolicy, 'coverage-v2:majority');
});
test('one available frame cannot satisfy the minimum support requirement', () => {
  assert.equal(aggregate([[0.9]], { solo: [0] }).tags.length, 0);
  assert.throws(() => aggregate([[0.9]], { solo: [0] }, 0.5, 'unknown'));
});
test('clear recurring clothing detail can be shorter than the action', () => {
  const frames=Array.from({length:16},(_,i)=>[i<4?0.8:0.1,i<4?0.8:0.1]);
  const result=aggregate(frames,{skirt:[0],solo:[1]},0.5);
  assert.deepEqual(result.tags.map(x=>x.tag),['skirt']);
  assert(result.uncertain.includes('solo'));
  frames[3][0]=0.6;
  assert.equal(aggregate(frames,{skirt:[0]},0.5).tags.length,0);
  assert.equal(aggregate(frames,{skirt:[0]},0.85).tags.length,0);
});
test('weak or isolated detail remains unselected and optional brief mode is separate', () => {
  const frames=Array.from({length:8},(_,i)=>[i<2?0.6:0.1]);
  assert.equal(aggregate(frames,{glasses:[0]},0.5).tags.length,0);
  assert.equal(aggregate(frames,{glasses:[0]},0.5,'brief').tags.length,1);
  frames[0][0]=0.99;frames[1][0]=0.1;
  assert.equal(aggregate(frames,{glasses:[0]},0.5).tags.length,0);
});

test('sloppy requires oral and saliva evidence in the same frames', () => {
  const mapping = { sloppy: { all: [[0, 1], [2, 3]] } };
  for (const mode of ['majority', 'brief']) {
    for (const frames of [Array(8).fill([.9, .1, .1, .1]), Array(8).fill([.1, .1, .9, .1]), Array.from({length:8}, (_, i) => i < 4 ? [.9, .1, .1, .1] : [.1, .1, .9, .1])]) {
      const result = aggregate(frames, mapping, .4, mode);
      assert.deepEqual(result.tags, []);
      assert.deepEqual(result.uncertain, []);
    }
    const frames = Array(8).fill([.1, .8, .1, .7]);
    const result = aggregate(frames, mapping, .4, mode);
    assert.equal(result.tags[0].tag, 'sloppy');
    assert.equal(result.tags[0].confidence, .7);
    assert.equal(result.tags[0].supportingFrames, 8);
    assert.deepEqual(aggregate(frames, mapping, .75, mode).tags, []);
    assert.deepEqual(aggregate(frames, mapping, .4, mode, {excludedTags:['sloppy']}).tags, []);
  }
  const isolated = Array.from({length:8}, (_, i) => i === 0 ? [.9, .1, .8, .1] : [.1, .1, .1, .1]);
  assert.deepEqual(aggregate(isolated, mapping, .4).tags, []);
  assert.deepEqual(aggregate(isolated, mapping, .4).uncertain, ['sloppy']);
});


test('review candidates can exceed upload limits without changing default suggestions',()=>{
 const mapping=Object.fromEntries(Array.from({length:80},(_,i)=>['review tag '+i,[i]]));
 const frames=Array.from({length:4},(_,frame)=>Array.from({length:80},(_,i)=>i<40||frame===0?.8:.1));
 const normal=aggregate(frames,mapping,.4),expanded=aggregate(frames,mapping,.4,'majority',{limitResults:false});
 assert.equal(normal.tags.length,20);assert.equal(normal.uncertain.length,15);
 assert.equal(expanded.tags.length,40);assert.equal(expanded.uncertain.length,40);
 assert.deepEqual(expanded.tags.slice(0,20),normal.tags);
 assert.deepEqual(expanded.uncertainScores.slice(0,15),normal.uncertainScores);
 assert.deepEqual(aggregate(frames,mapping,.4),normal);
});
