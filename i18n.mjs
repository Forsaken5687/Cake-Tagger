import { resolvedLanguage } from './preferences.mjs';
import { translate } from './messages.mjs';
let language = 'de';
let preference = 'auto', siteLanguage;
export function setLanguage(settings, browserLanguage = globalThis.navigator?.language || 'de') {
  preference = settings.language;
  language = resolvedLanguage(settings, siteLanguage || browserLanguage); return language;
}
export function setSiteLanguage(value) { siteLanguage = value === 'de' ? 'de' : 'en'; return setLanguage({ language: preference }); }
export function t(value) { return translate(value, language); }
// Retain the source message so an already visible status/error follows language changes.
export function localizedText(element, value) {
  element.dataset.i18n = value;
  element.textContent = t(value);
  return element;
}
export function translatePage(root = document) {
  document.documentElement.lang = language;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attribute of ['aria-label', 'placeholder', 'title', 'alt']) {
    for (const el of root.querySelectorAll(`[data-i18n-${attribute}]`)) el.setAttribute(attribute, t(el.getAttribute('data-i18n-' + attribute)));
  }
}
