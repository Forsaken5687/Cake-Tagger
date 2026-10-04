import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, english } from '../messages.mjs';
import { setLanguage, t, localizedText, translatePage } from '../i18n.mjs';
import fs from 'node:fs';

test('runtime validation and transfer errors are translated in both directions', () => {
  for (const name of ['sampling.mjs', 'analysis-settings.mjs', 'corrections.mjs', 'preferences.mjs', 'extension/upload-adapter.mjs']) {
    const source = fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
    for (const [, message] of source.matchAll(/(?:throw|reject\() (?:new )?Error\('([^']+)'\)/g)) {
      const de = translate(message, 'de');
      assert.notEqual(de, message, `${name}: missing German translation for ${message}`);
      assert.equal(translate(de, 'en'), message);
    }
  }
  assert.equal(translate('Transfer failed: Invalid tag selection.', 'de'), 'Übernahme fehlgeschlagen: Ungültige Tag-Auswahl.');
  assert.equal(translate('"tattoos" was not accepted by the site. Previously added tags are preserved.', 'de'), '"tattoos" wurde von der Seite nicht übernommen. Bereits ergänzte Tags bleiben erhalten.');
});

test('English source messages, legacy German keys and parameterized states follow the selected language', () => {
  for (const [de, en] of Object.entries(english)) assert.equal(translate(de, 'en'), en);
  setLanguage({ language: 'de' });
  assert.equal(t('Invalid video duration.'), 'Ungültige Videolänge.');
  assert.equal(t('Analysis complete · 16 images · 3.2 s · please review'), 'Analyse abgeschlossen · 16 Bilder · 3.2 s · bitte prüfen');
  setLanguage({ language: 'en' });
  assert.equal(t('Analysis complete · 16 images · 3.2 s · please review'), 'Analysis complete · 16 images · 3.2 s · please review');
  assert.equal(t('tattoos'), 'tattoos');
});

test('visible error and progress messages retain source values across a language switch', () => {
  const previous = globalThis.document;
  const error = { dataset: {}, textContent: '' }, progress = { dataset: {}, textContent: '' };
  try {
    globalThis.document = { documentElement: {}, querySelectorAll: selector => selector === '[data-i18n]' ? [error, progress] : [] };
    setLanguage({ language: 'en' });
    localizedText(error, 'Invalid video duration.'); localizedText(progress, 'Analyzing image 2 / 8 …');
    setLanguage({ language: 'de' }); translatePage();
    assert.equal(error.textContent, 'Ungültige Videolänge.');
    assert.equal(progress.textContent, 'Analysiere Bild 2 / 8 …');
    setLanguage({ language: 'en' }); translatePage();
    assert.equal(error.textContent, 'Invalid video duration.');
    assert.equal(progress.textContent, 'Analyzing image 2 / 8 …');
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
