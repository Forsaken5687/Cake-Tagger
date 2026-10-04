import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
if (process.argv.includes('--help')) {
  console.log('Usage: runtime/node.exe scripts/Benchmark-Native.mjs [--native-only]\nRuns eight synthetic frames through native CPU inference, then serves a browser comparison on http://127.0.0.1:8793/. Dependencies and reports stay in ignored work/native-benchmark/.');
  process.exit(0);
}
process.chdir(root);
fs.mkdirSync('work/native-benchmark/node_modules', { recursive: true });
function run(name) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/native-benchmark', name)], { cwd: root, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(name + ' exited with code ' + code)));
  });
}
await run('setup.mjs');
await run('native.mjs');
if (!process.argv.includes('--native-only')) await import('./native-benchmark/server.mjs');
