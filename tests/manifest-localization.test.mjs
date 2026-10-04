import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('both browser manifests resolve metadata through complete native locale catalogs', () => {
  const catalogs = Object.fromEntries(['en', 'de'].map(locale => [locale, JSON.parse(fs.readFileSync(new URL(`../extension/_locales/${locale}/messages.json`, import.meta.url), 'utf8'))]));
  assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs.de).sort());
  for (const filename of ['manifest.json', 'manifest.chrome.json']) {
    const manifest = JSON.parse(fs.readFileSync(new URL('../extension/' + filename, import.meta.url), 'utf8'));
    assert.equal(manifest.default_locale, 'en');
    assert.equal(manifest.name, 'Cake Tagger');
    for (const text of [manifest.description, manifest.action.default_title]) {
      const match = /^__MSG_(\w+)__$/.exec(text);
      assert(match, `${filename}: hardcoded browser metadata`);
      for (const catalog of Object.values(catalogs)) assert(catalog[match[1]]?.message?.trim());
    }
    assert.notEqual(catalogs.de.extensionDescription.message, catalogs.en.extensionDescription.message);
    assert.equal(catalogs.de.actionTitle.message, 'Cake Tagger öffnen');
  }
});
