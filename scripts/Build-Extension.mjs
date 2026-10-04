import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Windows scanners can briefly hold a just-written package directory open.
function renameDirectory(source,destination) {
  for(let attempt=0;;attempt++) {
    try { fs.renameSync(source,destination);return; }
    catch(error) {
      if(attempt>=19 || !['EPERM','EACCES','EBUSY'].includes(error.code))throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);
    }
  }
}
export function buildExtension(target) {
  if (!['firefox', 'chrome'].includes(target)) throw Error('Unsupported browser.');
  const output = target === 'chrome' ? path.join(root, 'outputs', target) : path.join(root, 'work', 'extension-build', target);
  // Assemble a fresh allowlisted folder; preserve previous contents outside the release.
  const buildRoot = path.join(root, 'work', 'extension-build');
  fs.mkdirSync(buildRoot, {recursive:true});
  const staging = fs.mkdtempSync(path.join(buildRoot,target+'-staging-'));
  if (![output,staging].every(p=>p.startsWith(root+path.sep))) throw Error('Build path outside project.');
  // Bundle only extension controls and bridges; model metadata and license notices stay intact.
  const files = ['src/shared/trusted-event.mjs', 'extension/webext-api.js', 'src/shared/preferences.mjs', 'src/shared/settings-ui.mjs', 'src/shared/messages.mjs', 'model/tags.txt', 'assets/logo.svg',
    'THIRD_PARTY.md', 'scripts/assets.json', 'model/LICENSE.txt', 'model/coverage.json',
    'model/provenance.json', 'model/top_tags.txt', 'vendor/LICENSE-ONNX.txt', 'vendor/ThirdPartyNotices.txt',
    'extension/background.js', 'extension/command-relay.mjs', 'extension/popup.html', 'extension/popup.mjs', 'extension/popup.css', 'extension/server-connection.mjs',
    'extension/bridge.html', 'extension/bridge.mjs', 'extension/bridge.css',
    'extension/content.js', 'extension/content.css', 'extension/embedded-upload.mjs', 'extension/upload-ui.mjs',
    'src/shared/site-theme.mjs', 'src/shared/message-contract.mjs',
    'extension/upload-adapter.mjs', 'extension/_locales/en/messages.json', 'extension/_locales/de/messages.json'];
  if (target === 'chrome') files.push('extension/chrome-worker.mjs', ...[16,32,48,128].map(size => `assets/logo-${size}.png`));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, target === 'chrome' ? 'extension/manifest.chrome.json' : 'extension/manifest.json'), 'utf8'));
  const entries = [{ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) }, { name: 'README.md', data: fs.readFileSync(path.join(root, 'docs/BROWSERS.md')) }, ...files.map(name => ({ name:name.startsWith('extension/_locales/') ? name.slice('extension/'.length) : name, data: fs.readFileSync(path.join(root, name)) }))];
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
    const dest = path.join(staging, entry.name); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data);
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const zip = target === 'chrome' ? path.join(root, 'work', 'extension-build', 'Cake-Tagger-Chrome.zip') : path.join(root, 'outputs', 'Cake-Tagger-Firefox.zip');
  fs.mkdirSync(path.dirname(zip), {recursive:true});
  fs.writeFileSync(zip, Buffer.concat([...blocks, directory, end]));
  let previous;
  if (fs.existsSync(output)) {
    previous = fs.mkdtempSync(path.join(buildRoot,target+'-previous-'));
    renameDirectory(output,path.join(previous,'package'));
  }
  fs.mkdirSync(path.dirname(output),{recursive:true});
  try { renameDirectory(staging,output); }
  catch(error) { if(previous)renameDirectory(path.join(previous,'package'),output);throw error; }
  console.log(`${target} extension created: ${target === 'chrome' ? 'outputs/chrome/' : 'outputs/Cake-Tagger-Firefox.zip'}`);
  return {files:entries.map(entry=>entry.name), previous:previous && path.join(previous,'package')};
}

// Direct invocation and imported test usage share the same builder.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildExtension(process.argv[2]);
