export const THEME_VARIABLES = {
  '--bg': '--cake-bg', '--panel': '--cake-surface-2', '--surface': '--cake-surface',
  '--line': '--cake-border', '--line-strong': '--cake-border-2', '--text': '--cake-text',
  '--muted': '--cake-text-2', '--subtle': '--cake-text-3', '--accent': '--cake-accent',
  '--accent-hover': '--cake-accent-hi', '--on-accent': '--cake-on-accent',
  '--accent-soft': '--cake-accent-a12', '--accent-border': '--cake-accent-a45',
  '--accent-score': '--cake-accent-2', '--mint': '--cake-online'
};
export function normalizeTheme(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const colors = {};
  for (const key of Object.keys(THEME_VARIABLES)) {
    const color = value.colors?.[key];
    if (typeof color !== 'string' || color.length > 80) continue;
    if (/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(color) || /^rgba?\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) colors[key] = color;
  }
  return { colors, language: value.language === 'de' ? 'de' : 'en' };
}
export function readSiteTheme(doc) {
  const root = doc.querySelector('.stok-root') || doc.documentElement;
  const computed = doc.defaultView.getComputedStyle(root);
  return normalizeTheme({ colors: Object.fromEntries(Object.entries(THEME_VARIABLES).map(([key, variable]) => [key, computed.getPropertyValue(variable).trim()])), language: doc.documentElement.lang });
}
export function applySiteTheme(doc, value) {
  const theme = normalizeTheme(value);
  if (!theme) return null;
  for (const [key, color] of Object.entries(theme.colors)) {
    if (doc.defaultView.CSS.supports('color', color)) doc.documentElement.style.setProperty(key, color);
  }
  return theme;
}
export function isThemeMessage(event, source, origin, channel) {
  return event.source === source && event.origin === origin && !!channel && event.data?.channel === channel && event.data.type === 'cake-tagger:theme' && !!normalizeTheme(event.data.theme);
}
