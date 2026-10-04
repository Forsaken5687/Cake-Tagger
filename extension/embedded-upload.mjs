// Keep the analysis document on the extension origin, separate from the site.
import { translate } from '../messages.mjs';
import { readSiteTheme } from './site-theme.mjs';
export function mountUploadPanel(doc, runtime) {
  const selections = new WeakMap();
  let panel, frame, mount, ready = false, channel, lastSelection = '', timer;
  let english = false;
  let preferences = { language: 'auto', autoAnalyzeEmbed: true }, lastTheme = '';
  const label = key => translate(key, english ? 'en' : 'de');
  function applyLanguage(settings) {
    preferences = settings;
    english = settings.language === 'en' || (settings.language === 'auto' && readSiteTheme(doc).language !== 'de');
    if (panel) {
      if (frame) frame.title = label('embed.title');
      panel.querySelector('.cake-tagger-heading span').textContent = label('analysis.start');
      panel.querySelector('button').textContent = frame && !frame.hidden ? label('action.close') : label('action.open');
    }
  }
  runtime.sendMessage({ type: 'cake-tagger:settings-get' }).then(response => { if (response?.settings) { applyLanguage(response.settings); refresh(); } }).catch(() => {});
  runtime.onMessage?.addListener((message, sender) => {
    if (sender.id === runtime.id && message?.type === 'cake-tagger:settings-updated') { applyLanguage(message.settings); refresh(); }
  });
  const extensionOrigin = runtime.getURL('').replace(/\/$/, '');
  const visible = node => node?.isConnected && !node.closest('[hidden]') && node.getClientRects().length > 0;
  const fileKey = file => `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
  function syncTheme(force = false) {
    const theme = readSiteTheme(doc), key = JSON.stringify(theme);
    if (!force && key === lastTheme) return;
    lastTheme = key; applyLanguage(preferences);
    if (ready && frame) frame.contentWindow.postMessage({ type: 'cake-tagger:theme', channel, theme }, extensionOrigin);
    runtime.sendMessage({ type: 'cake-tagger:site-theme', theme }).catch(() => {});
  }

  function activeFiles() {
    if (!mount) return [];
    const names = new Set(Array.from(mount.querySelectorAll('.stok-bulk-card:not(.is-done) .stok-bulk-name'), node => node.textContent));
    const drop = mount.querySelector('.stok-up-drop.has-file');
    if (drop && !mount.querySelector('.stok-up-preview.is-strip')) names.add(drop.textContent.split(' · tap to add more')[0].trim());
    return [...(selections.get(mount)?.values() || [])].filter(file => names.has(file.name));
  }

  function syncFiles() {
    if (!ready || !frame) return;
    const files = activeFiles(), key = JSON.stringify(files.map(fileKey));
    if (key === lastSelection) return;
    lastSelection = key;
    frame.contentWindow.postMessage({ type: 'cake-tagger:files', channel, files }, extensionOrigin);
  }

  async function open() {
    if (frame) { frame.hidden = !frame.hidden; panel.querySelector('button').textContent = frame.hidden ? label('action.open') : label('action.close'); return; }
    channel = [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
    frame = doc.createElement('iframe');
    frame.title = label('embed.title'); frame.className = 'cake-tagger-frame';
    const url = new URL(runtime.getURL('index.html')); url.searchParams.set('embedded', '1'); url.searchParams.set('channel', channel);
    const created = frame, owner = panel;
    try {
      const id = await runtime.sendMessage({ type: 'cake-tagger:tab-id' });
      if (Number.isInteger(id) && id > 0) url.searchParams.set('target', String(id));
    } catch { /* The embedded document can also request its tab ID. */ }
    if (frame !== created || !owner.isConnected) return;
    frame.src = url.href; panel.append(frame); panel.querySelector('button').textContent = label('action.close');
  }

  function refresh() {
    syncTheme();
    const next = [...doc.querySelectorAll('.stok-up-mount')].find(visible);
    if (!next) {
      if (mount && !mount.isConnected) { panel?.remove(); panel = frame = mount = undefined; ready = false; lastSelection = ''; }
      return;
    }
    if (next !== mount) {
      panel?.remove(); mount = next; ready = false; frame = undefined; lastSelection = '';
      panel = doc.createElement('section'); panel.className = 'cake-tagger-panel'; panel.setAttribute('aria-label', 'Cake Tagger');
      const head = doc.createElement('div'); head.className = 'cake-tagger-heading';
      const title = doc.createElement('strong'); title.textContent = 'Cake Tagger';
      const note = doc.createElement('span'); note.textContent = label('analysis.start');
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = label('action.open'); button.addEventListener('click', open);
      head.append(title, note, button); panel.append(head); mount.before(panel);
    }
    if (preferences.autoAnalyzeEmbed && !frame && activeFiles().length) void open();
    syncFiles();
  }

  function capture(files, owner) {
    if (!owner) return;
    if (!selections.has(owner)) selections.set(owner, new Map());
    const selected = selections.get(owner);
    for (const file of files || []) if (/\.(mp4|m4v|webm|mov)$/i.test(file.name)) selected.set(file.name, file);
    clearTimeout(timer); timer = setTimeout(refresh, 100);
  }
  doc.addEventListener('change', event => {
    if (event.isTrusted && event.target.matches('input[type="file"]')) capture(event.target.files, event.target.closest('.stok-up-mount'));
  }, true);
  doc.addEventListener('drop', event => {
    if (event.isTrusted && event.target.closest('.stok-up-drop,.stok-bulk-drop')) capture(event.dataTransfer?.files, event.target.closest('.stok-up-mount'));
  }, true);
  doc.defaultView.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== extensionOrigin || event.data?.channel !== channel) return;
    if (event.data.type === 'cake-tagger:ready') { ready = true; lastSelection = ''; syncTheme(true); syncFiles(); }
  });
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(refresh, 100); });
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  // Theme changes must not be delayed by frequently updated playback controls.
  const themeObserver = new MutationObserver(() => syncTheme());
  themeObserver.observe(doc.head, { subtree: true, childList: true, characterData: true });
  for (const node of [doc.documentElement, doc.body, doc.querySelector('.stok-root')].filter(Boolean)) {
    themeObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'lang'] });
  }
  refresh();
}
