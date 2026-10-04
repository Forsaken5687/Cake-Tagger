import { resolvedLanguage } from './preferences.mjs';
import { translate } from './messages.mjs';
let language = 'de';
let preference = 'auto', siteLanguage;
export function setLanguage(settings, browserLanguage = globalThis.navigator?.language || 'de') {
  preference = settings.language;
  language = resolvedLanguage(settings, siteLanguage || browserLanguage); return language;
}
export function setSiteLanguage(value) { siteLanguage = value === 'de' ? 'de' : 'en'; return setLanguage({ language: preference }); }
export function t(value, params) { return translate(value, language, params); }
// Retain the source message so an already visible status/error follows language changes.
export function localizedText(element, value, params = {}) {
  element.dataset.i18n = typeof value === 'object' ? value.key : value;
  element.dataset.i18nParams = JSON.stringify(typeof value === 'object' ? value.params || {} : params);
  element.textContent = t(value, params);
  return element;
}
export function translatePage(root = document) {
  document.documentElement.lang = language;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n, readParams(el.dataset.i18nParams));
  for (const attribute of ['aria-label', 'placeholder', 'title', 'alt']) {
    for (const el of root.querySelectorAll(`[data-i18n-${attribute}]`)) el.setAttribute(attribute, t(el.getAttribute('data-i18n-' + attribute), readParams(el.getAttribute('data-i18n-' + attribute + '-params'))));
  }
}

function readParams(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

export function localizedAttribute(element, attribute, key, params = {}) {
  element.setAttribute('data-i18n-' + attribute, key);
  element.setAttribute('data-i18n-' + attribute + '-params', JSON.stringify(params));
  element.setAttribute(attribute, t(key, params));
}
