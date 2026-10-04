import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('The native runtime requires Windows x64.');
const assets = JSON.parse(fs.readFileSync(path.join(root, 'scripts/assets.json'))).assets.filter(asset => asset.path.startsWith('runtime/native/archives/'));
const destination = path.join(root, 'runtime/native/node_modules');
const stampPath = path.join(root, 'runtime/native/installed.json');
const signature = JSON.stringify(assets.map(asset => asset.sha256));
let installed;
try { installed = JSON.parse(fs.readFileSync(stampPath)); } catch {}
// Archives remain available in releases for offline restoration. Verify before
// extraction and never execute npm lifecycle scripts or optional GPU installers.
for (const asset of assets) {
  const archive = path.join(root, asset.path);
  if (createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== asset.sha256) throw Error('Native dependency checksum mismatch: ' + asset.path);
}
if (installed?.signature === signature && installed.files?.length && installed.files.every(file => {
  try { return createHash('sha256').update(fs.readFileSync(path.join(destination, file.path))).digest('hex') === file.sha256; } catch { return false; }
})) process.exit(0);
for (const asset of assets) {
  const name = path.basename(asset.path, '.tgz');
  const target = path.join(destination, name);
  fs.mkdirSync(target, { recursive: true });
  const result = spawnSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe'),
    ['-xzf', path.join(root, asset.path), '-C', target, '--strip-components=1'], { windowsHide: true, stdio: 'inherit' });
  if (result.status !== 0) throw Error('Native runtime extraction failed: ' + name);
}
const files = [];
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(absolute);
    else if (entry.isFile()) files.push({ path: path.relative(destination, absolute), sha256: createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') });
  }
}
scan(destination);
fs.writeFileSync(stampPath, JSON.stringify({ signature, files }));
console.log('Native CPU runtime is ready.');
