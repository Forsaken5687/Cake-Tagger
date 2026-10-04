import test from 'node:test';
import assert from 'node:assert/strict';
import { createInferencePool, inferenceConcurrency } from '../inference-pool.mjs';

function fixture(options = {}) {
  const workers = [], progress = [];
  const pool = createInferencePool({ concurrency: 4, ...options, onProgress: current => progress.push(current),
    createWorker() {
      const worker = { terminated: false, postMessage(data, transfer) { this.data = structuredClone(data, { transfer }); },
        terminate() { this.terminated = true; },
        emit(data) { this.onmessage({ data }); },
        done() { this.emit({ type: 'done', scores: this.data.frames.map(frame => new Float32Array(5813).fill(frame[0])),
          timings: { modelLoadSeconds: 0.2, preprocessSeconds: 0.1, inferenceSeconds: this.data.frames.length },
          runtime: { provider: 'wasm', configuredWasmThreads: 1 } }); } };
      workers.push(worker); return worker;
    } });
  return { pool, workers, progress };
}
const frames = count => Array.from({ length: count }, (_, index) => new Uint8ClampedArray([index + 1]));

test('pool restores temporal order after out-of-order completion and reuses sessions', async () => {
  const { pool, workers, progress } = fixture();
  const inputs = frames(8), pending = pool.infer(inputs);
  assert.equal(workers.length, 4);
  assert(inputs.every(frame => frame.byteLength === 0), 'input buffers are transferred');
  workers[2].emit({ type: 'progress', current: 2 }); workers[2].done(); workers[0].done();
  workers[3].emit({ type: 'progress', current: 1 }); workers[3].done(); workers[1].done();
  const result = await pending;
  assert.deepEqual(result.scores.map(row => row[0]), [1,2,3,4,5,6,7,8]);
  assert.equal(result.runtime.inferenceWorkers, 4);
  assert.equal(result.timings.inferenceSeconds, 2);
  assert(progress.every((value, index) => value >= (progress[index - 1] || 0)));
  assert.equal(progress.at(-1), 8);
  const second = pool.infer(frames(2)); workers[1].done(); workers[0].done();
  assert.equal((await second).runtime.inferenceWorkers, 2);
  assert.equal(workers.length, 4, 'no extra sessions for the next video'); pool.stop();
});

test('failure and cancellation stop every worker, reject partial results and permit restart', async () => {
  const { pool, workers } = fixture();
  const failed = pool.infer(frames(8)); workers[0].done(); workers[1].emit({ type: 'error', error: 'error.modelOutput' });
  await assert.rejects(failed);
  assert(workers.every(worker => worker.terminated));
  const cancelled = pool.infer(frames(4)); pool.stop(); await assert.rejects(cancelled, { name: 'AbortError' });
  // Messages from a terminated batch must not contaminate a replacement batch.
  const restarted = pool.infer(frames(1)); workers[4].done(); workers.at(-1).done();
  assert.equal((await restarted).scores[0][0], 1); pool.stop();
});

test('malformed worker output stops the pool instead of returning incomplete scores', async () => {
  const { pool, workers } = fixture({ concurrency: 1 });
  const pending = pool.infer(frames(2));
  workers[0].emit({ type: 'done', scores: [], timings: { inferenceSeconds: 1 } });
  await assert.rejects(pending); assert(workers[0].terminated);
});

test('isolated pages retain threaded inference; pool size respects CPU and memory limits', () => {
  assert.equal(inferenceConcurrency({ isolated: true, cores: 24 }), 1);
  assert.equal(inferenceConcurrency({ isolated: false, cores: 24 }), 4);
  assert.equal(inferenceConcurrency({ cores: 4 }), 2);
  assert.equal(inferenceConcurrency({ cores: 24, memoryGB: 4 }), 2);
  assert.equal(inferenceConcurrency({ cores: 24, memoryGB: 2 }), 1);
  assert.equal(inferenceConcurrency({ cores: NaN }), 1);
});
