import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTheme, readSiteTheme, applySiteTheme, isThemeMessage } from '../src/shared/site-theme.mjs';
import { setLanguage, setSiteLanguage, t } from '../src/client/i18n.mjs';

test('site theme reads the Cake palette and updates it without retaining stale accents', () => {
  const source = new Map([['--cake-accent', '#fe2c55'], ['--cake-accent-a12', 'rgba(254, 44, 85, .12)'], ['--cake-text', '#ffffff']]);
  const applied = new Map();
  const doc = {
    querySelector: () => ({}),
    documentElement: { lang: 'en', style: { setProperty: (key, value) => applied.set(key, value) } },
    defaultView: { getComputedStyle: () => ({ getPropertyValue: key => source.get(key) || '' }), CSS: { supports: () => true } }
  };
  applySiteTheme(doc, readSiteTheme(doc));
  assert.equal(applied.get('--accent'), '#fe2c55');
  assert.equal(applied.get('--accent-soft'), 'rgba(254, 44, 85, .12)');
  source.set('--cake-accent', '#267dff'); source.set('--cake-text', '#101010');
  source.set('--cake-accent-a12', 'rgba(38, 125, 255, .12)');
  applySiteTheme(doc, readSiteTheme(doc));
  assert.equal(applied.get('--accent'), '#267dff');
  assert.equal(applied.get('--text'), '#101010');
  assert.equal(applied.get('--accent-soft'), 'rgba(38, 125, 255, .12)');
});

test('theme messages require the correct parent, origin and session; only color tokens are accepted', () => {
  const source = {};
  const theme = { colors: { '--accent': '#267dff', '--bg': 'url(https://example.com)', '--arbitrary': '#fff' }, language: 'en' };
  assert.deepEqual(normalizeTheme(theme).colors, { '--accent': '#267dff' });
  const event = { source, origin: 'https://cake.ski', data: { type: 'cake-tagger:theme', channel: 'session', theme } };
  assert.ok(isThemeMessage(event, source, event.origin, 'session'));
  assert.equal(isThemeMessage(event, {}, event.origin, 'session'), false);
  assert.equal(isThemeMessage(event, source, 'https://example.com', 'session'), false);
  assert.equal(isThemeMessage(event, source, event.origin, 'other'), false);
  assert.equal(isThemeMessage({ ...event, data: { ...event.data, theme: null } }, source, event.origin, 'session'), false);
});

test('automatic extension language follows Cake while explicit language stays selected', () => {
  setLanguage({ language: 'auto' }, 'de'); setSiteLanguage('en');
  assert.equal(t('settings.title'), 'Settings');
  setSiteLanguage('de'); assert.equal(t('settings.title'), 'Einstellungen');
  setLanguage({ language: 'en' }); setSiteLanguage('de');
  assert.equal(t('settings.title'), 'Settings');
});
