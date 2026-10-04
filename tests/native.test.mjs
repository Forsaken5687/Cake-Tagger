import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createNativeEngine } from '../native-engine.mjs';
import { createNativeClient } from '../native-client.mjs';
import { validateRuntime } from '../analysis-settings.mjs';

test('native engine shares one worker, bounds its queue and discards only the cancelled client', async () => {
  const workers = [];
  class FakeWorker extends EventEmitter {
    messages = [];
    postMessage(message) { this.messages.push(message); }
    terminate() { this.emit('exit'); }
    complete(result) { this.emit('message', { id: this.messages.at(-1).id, result }); }
  }
  const engine = createNativeEngine({ createWorker() { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  const cancellation = new AbortController();
  const first = engine.infer(new Uint8ClampedArray(4), 'auto', cancellation.signal);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = engine.infer(new Uint8ClampedArray(4), '4');
  cancellation.abort(); await rejected;
  assert.equal(workers.length, 1);
  workers[0].complete('discarded');
  assert.equal(workers[0].messages.length, 2);
  workers[0].complete('second');
  assert.equal(await second, 'second');
  const third = engine.infer(new Uint8ClampedArray(4), 'auto');
  workers[0].emit('error', Error('crash'));
  await assert.rejects(third, /nativeInference/);
  const fourth = engine.infer(new Uint8ClampedArray(4), 'auto');
  assert.equal(workers.length, 2);
  workers[0].emit('exit'); // A stale worker exit must not terminate its replacement.
  workers[1].complete('recovered');
  assert.equal(await fourth, 'recovered');
  const queued = Array.from({ length: 9 }, () => engine.infer(new Uint8ClampedArray(4), 'auto'));
  await assert.rejects(engine.infer(new Uint8ClampedArray(4), 'auto'), /nativeBusy/);
  const stopped = queued.map(promise => assert.rejects(promise, /cancelled/));
  engine.stop(); await Promise.all(stopped);
});

test('extension client reconnects after server restart and preserves frame order', async () => {
  let connections = 0, calls = 0;
  const progress = [];
  const client = createNativeClient({ extension: true, onProgress: current => progress.push(current), fetcher: async (url, options) => {
    assert(url.startsWith('http://127.0.0.1:8765/api/'));
    if (url.endsWith('/connect')) {
      assert.equal(options.headers['X-Cake-Tagger-Client'], 'extension');
      connections++; return { ok: true, json: async () => ({ token: String(connections).repeat(48) }) };
    }
    if (++calls === 2) return { status: 401 };
    assert.equal(options.headers.Authorization, 'Bearer ' + String(connections).repeat(48));
    return { status: 200, ok: true, json: async () => ({ scores: Array(5813).fill(options.body[0] / 255),
      timings: { modelLoadSeconds: 0, preprocessSeconds: 0.01, inferenceSeconds: 0.2 }, runtime: { provider: 'native-cpu' } }) };
  } });
  const result = await client.infer([new Uint8ClampedArray(448 * 448 * 4).fill(0), new Uint8ClampedArray(448 * 448 * 4).fill(255)], '4');
  assert.equal(connections, 2); assert.deepEqual(progress, [1, 2]);
  assert.equal(result.scores[0][0], 0); assert.equal(result.scores[1][0], 1);
  assert.equal(result.timings.inferenceSeconds, 0.4);
});

test('native metadata exports actual server threads and retains legacy WASM support', () => {
  const runtime = { provider: 'native-cpu', configuredNativeThreads: 8, inferenceWorkers: 1,
    hardwareConcurrency: 24, runtimeVersion: '1.30.0', modelSha256: 'a'.repeat(64), parallelismLimit: 'auto' };
  assert.deepEqual(validateRuntime(runtime), runtime);
  assert.throws(() => validateRuntime({ ...runtime, configuredNativeThreads: 999 }));
  assert.throws(() => validateRuntime({ ...runtime, modelSha256: 'unknown' }));
});
