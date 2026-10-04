import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function buildExtension(target) {
  if (!['firefox', 'chrome'].includes(target)) throw Error('Unsupported browser.');
  const output = target === 'chrome' ? path.join(root, 'outputs', target) : path.join(root, 'work', 'extension-build', target);
  fs.mkdirSync(output, { recursive: true });
  // Bundle only extension controls and bridges; model metadata and license notices stay intact.
  const files = ['webext-api.js', 'preferences.mjs', 'settings-ui.mjs', 'messages.mjs', 'tags.txt', 'assets/logo.svg',
    'THIRD_PARTY.md', 'scripts/assets.json', 'model/LICENSE.txt', 'model/coverage.json',
    'model/provenance.json', 'model/top_tags.txt', 'vendor/LICENSE-ONNX.txt', 'vendor/ThirdPartyNotices.txt',
    'extension/background.js', 'extension/popup.html', 'extension/popup.mjs', 'extension/popup.css', 'extension/server-connection.mjs',
    'extension/bridge.html', 'extension/bridge.mjs', 'extension/bridge.css',
    'extension/content.js', 'extension/content.css', 'extension/embedded-upload.mjs', 'extension/upload-ui.mjs',
    'extension/site-theme.mjs', 'extension/message-contract.mjs',
    'extension/upload-adapter.mjs', '_locales/en/messages.json', '_locales/de/messages.json'];
  if (target === 'chrome') files.push('extension/chrome-worker.mjs', ...[16,32,48,128].map(size => `assets/logo-${size}.png`));
  // Prune only obsolete application code, never notices, provenance or unknown user files.
  const retired = ['extension/local-bridge.js', 'i18n.mjs', 'index.html', 'app.js', 'style.css', 'native-client.mjs', 'runtime-metrics.mjs',
    'analysis-settings.mjs', 'corrections.mjs', 'sampling.mjs',
    'tagging.mjs', 'tag-policy.mjs', 'mapping.json', 'extension/integration.mjs',
    'extension/settings-background.mjs', 'extension/auto-analysis.mjs', 'vendor/ort.wasm.min.js',
    'vendor/ort-wasm-simd-threaded.mjs', 'vendor/ort-wasm-simd-threaded.wasm', 'engine-worker.js', 'compute-policy.js', 'inference-pool.mjs'];
  for (const name of retired) fs.rmSync(path.join(output, name), { force: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, target === 'chrome' ? 'extension/manifest.chrome.json' : 'extension/manifest.json'), 'utf8'));
  const entries = [{ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) }, { name: 'README.md', data: fs.readFileSync(path.join(root, target === 'chrome' ? 'docs/CHROME.md' : 'docs/FIREFOX.md')) }, ...files.map(name => ({ name, data: fs.readFileSync(path.join(root, name)) }))];
  // Store-only ZIP: no packaging dependency and no private files from recursive folder scans.
  const table = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  function crc32(data) { let n = 0xffffffff; for (const byte of data) n = table[(n ^ byte) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }
  const blocks = [], central = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = entry.data, crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x800, 8); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    local.writeUInt16LE(33, 12); dir.writeUInt16LE(33, 14); // Valid DOS date: 1980-01-01.
    blocks.push(local, name, data); central.push(dir, name); offset += local.length + name.length + data.length;
    const dest = path.join(output, entry.name); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data);
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const zip = target === 'chrome' ? path.join(root, 'work', 'extension-build', 'Cake-Tagger-Chrome.zip') : path.join(root, 'outputs', 'Cake-Tagger-Firefox.zip');
  fs.mkdirSync(path.dirname(zip), {recursive:true});
  fs.writeFileSync(zip, Buffer.concat([...blocks, directory, end]));
  console.log(`${target} extension created: ${target === 'chrome' ? 'outputs/chrome/' : 'outputs/Cake-Tagger-Firefox.zip'}`);

}
