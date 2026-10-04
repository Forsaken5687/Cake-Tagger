import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { messages, message, translate, messageError, errorMessage } from '../messages.mjs';
import { setLanguage, t, localizedText, localizedAttribute, translatePage } from '../i18n.mjs';

test('both languages define identical placeholders and every source message ID exists', () => {
  const placeholders = text => [...text.matchAll(/\{([a-zA-Z]+)\}/g)].map(match => match[1]).sort();
  for (const [key, entry] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(entry).sort(), ['de', 'en'], key);
    assert.deepEqual(placeholders(entry.en), placeholders(entry.de), key);
    assert(!/[\uFFFD]|Ã|â€/.test(entry.en + entry.de), `${key}: corrupted encoding`);
  }
  for (const dir of ['.', 'extension']) {
    for (const name of fs.readdirSync(new URL('../' + dir + '/', import.meta.url))) {
      if (!/\.(mjs|js|html)$/.test(name) || name === 'messages.mjs') continue;
      const source = fs.readFileSync(new URL('../' + dir + '/' + name, import.meta.url), 'utf8');
      for (const [, key] of source.matchAll(/["']((?:action|settings|language|page|upload|analysis|results|tags|export|preview|transfer|embed|error|diagnostics)\.[a-zA-Z]+)["']/g)) {
        if (/\.(txt|json|mjs|js|html)$/.test(key)) continue;
        assert(Object.hasOwn(messages, key), `${name}: unknown message ${key}`);
      }
    }
  }
});

test('message parameters stay literal and nested errors survive serialization', () => {
  const tag = 'Settings {count} <video>';
  assert.equal(translate(message('error.tagRejected', { tag }), 'en'), '"' + tag + '" was not accepted by the site. Previously added tags are preserved.');
  const error = messageError('error.invalidVideoDuration');
  assert.equal(error.message, 'Invalid video duration.');
  const serialized = JSON.parse(JSON.stringify(message('error.transferFailed', { error: errorMessage(error) })));
  assert.equal(translate(serialized, 'de'), 'Übernahme fehlgeschlagen: Ungültige Videolänge.');
  assert.equal(translate(serialized, 'en'), 'Transfer failed: Invalid video duration.');
  assert.equal(translate(message('error.tagRejected', { tag: 'tattoos' }), 'de'), '"tattoos" wurde von der Seite nicht übernommen. Bereits ergänzte Tags bleiben erhalten.');
  assert.equal(translate(errorMessage(new Error('Library detail')), 'de'), 'Library detail');
  assert.equal(translate('tattoos', 'de'), 'tattoos');
  assert.equal(translate('action.add', 'de'), 'Hinzufügen');
  assert.equal(translate('results.summarySingle', 'en', { count: 1, done: 0 }), '1 video · 0 analyzed');
});

test('visible messages and parameterized attributes follow language changes', () => {
  const previous = globalThis.document;
  const makeElement = () => ({ dataset: {}, textContent: '', attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; } });
  const progress = makeElement(), error = makeElement(), preview = makeElement();
  try {
    globalThis.document = { documentElement: {}, querySelectorAll: selector => selector === '[data-i18n]' ? [error, progress] : selector === '[data-i18n-alt]' ? [preview] : [] };
    setLanguage({ language: 'en' });
    localizedText(error, errorMessage(messageError('error.invalidVideoDuration')));
    localizedText(progress, message('analysis.progress', { current: 2, total: 8 }));
    localizedAttribute(preview, 'alt', 'preview.position', { current: 2, total: 8 });
    setLanguage({ language: 'de' }); translatePage();
    assert.equal(error.textContent, 'Ungültige Videolänge.');
    assert.equal(progress.textContent, 'Analysiere Bild 2 / 8 …');
    assert.equal(preview.attrs.alt, 'Vorschaubild 2 von 8');
    setLanguage({ language: 'en' }); translatePage();
    assert.equal(error.textContent, 'Invalid video duration.');
    assert.equal(progress.textContent, 'Analyzing image 2 / 8 …');
    assert.equal(preview.attrs.alt, 'Preview 2 of 8');
    assert.equal(t('settings.title'), 'Settings');
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
