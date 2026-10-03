import { resolvedLanguage } from './preferences.mjs';
let language = 'de';
const english = {
  'Einstellungen': 'Settings', 'Schließen': 'Close', 'Sprache': 'Language', 'Browsersprache': 'Browser language', 'Deutsch': 'Deutsch', 'English': 'English',
  'Bilder pro Video': 'Images per video', 'Automatisch nach Videolänge': 'Automatic by video length',
  'Scores anzeigen': 'Show scores', 'Unsichere Vorschläge anzeigen': 'Show uncertain suggestions',
  'Ausgeschlossene Tags': 'Excluded tags', 'Gilt für neue automatische Vorschläge. Manuelle Tags und vorhandene Auswahlen bleiben erhalten.': 'Applies to new automatic suggestions. Manual tags and existing selections are preserved.',
  'Tag suchen …': 'Search tags …', 'Tag ausschließen': 'Exclude tag', 'Hinzufügen': 'Add', 'Ausschluss entfernen: ': 'Remove exclusion: ', 'Bitte einen Tag aus der Liste wählen.': 'Please choose a tag from the list.',
  'Standardwerte': 'Defaults', 'Speichern': 'Save', 'Gespeichert': 'Saved', 'Analyse öffnen': 'Open analysis',
  'Programm beenden': 'Quit', 'Videos taggen': 'Tag videos', 'Tag-Vorschläge für deine Videos.': 'Tag suggestions for your videos.',
  'Neue Videos': 'New videos', 'Analyse': 'Analysis', 'Bereit': 'Ready', 'Verbindung wird geprüft …': 'Checking connection …',
  'Videos hierher ziehen': 'Drop videos here', 'oder klicken und Dateien auswählen': 'or click to choose files', 'Videos auswählen': 'Choose videos',
  'Tags vorschlagen': 'Suggest tags', 'Analyse abbrechen': 'Cancel analysis', 'Videos & Tags': 'Videos & tags', 'Tag-Auswahl': 'Tag selection',
  'JSON herunterladen': 'Download JSON', 'Ausgewählte Tags als JSON herunterladen.': 'Download selected tags as JSON.',
  'Ergebnisse bleiben bis zum Neuladen in dieser Sitzung.': 'Results stay in this session until the page is reloaded.',
  'Zurück': 'Previous', 'Weiter': 'Next', 'Vorschaubild schließen': 'Close preview', 'Vorheriges Vorschaubild': 'Previous preview', 'Nächstes Vorschaubild': 'Next preview',
  'Noch keine Videos': 'No videos yet', 'Wähle Videos im Upload-Bereich aus.': 'Choose videos in the upload area.', 'Wähle Videos aus, um deine Tag-Auswahl zusammenzustellen.': 'Choose videos to create your tag selection.',
  'Wartet auf Analyse': 'Waiting for analysis', 'Videos werden vorbereitet …': 'Preparing videos …', 'Vorschaubilder werden gelesen …': 'Reading preview images …',
  'Auswahl aus dieser Sitzung übernommen': 'Selection restored from this session', 'Unbekannt': 'Unknown', 'Unsicher': 'Uncertain', 'Vorschlag': 'Suggested', 'Ergänzt': 'Added', 'Ergänzen': 'Add',
  'Manuell ergänzt': 'Added manually', 'Herkunft im alten Ergebnis nicht dokumentiert': 'Origin not recorded in the old result', 'Ursprünglicher Modellvorschlag': 'Original model suggestion',
  'Modellscore: Durchschnitt der zwei stärksten Bildtreffer. Keine gemessene Wahrscheinlichkeit für einen richtigen Tag.': 'Model score: average of the two strongest image matches. This is not a measured probability that the tag is correct.',
  'Keine ausreichend klaren Tags gefunden. Bitte manuell prüfen.': 'No sufficiently clear tags found. Please review manually.',
  'Aus altem Export übernommen. Ursprüngliche Vorschläge und Scores sind hier nicht vollständig bekannt.': 'Restored from an old export. Original suggestions and scores are not fully known.',
  'Weiteren Tag suchen …': 'Search for another tag …', 'Bitte einen Tag aus deiner vorhandenen Liste wählen.': 'Please choose a tag from the available list.',
  'Abgebrochen': 'Cancelled', 'Analyse fehlgeschlagen': 'Analysis failed', 'Analyse abgebrochen. Fertige Ergebnisse bleiben erhalten.': 'Analysis cancelled. Completed results are preserved.',
  'Programm beendet': 'Stopped', 'Du kannst dieses Fenster schließen.': 'You can close this window.', 'Kleines Tagging-Modell wird geladen …': 'Loading tagging model …',
  'Tags auf cake.ski ergänzen': 'Add tags on cake.ski', 'Bitte mindestens einen Tag auswählen.': 'Please select at least one tag.', 'Bitte einen cake.ski-Tab auswählen.': 'Please choose a cake.ski tab.',
  'cake.ski verbinden': 'Connect cake.ski', 'Upload-Tab': 'Upload tab', 'Tabs aktualisieren': 'Refresh tabs', 'Kein cake.ski-Tab geöffnet': 'No cake.ski tab open',
  'Dieselben Videos auf cake.ski auswählen, dann die geprüften Tags pro Datei ergänzen.': 'Choose the same videos on cake.ski, then add reviewed tags for each file.',
  'Bitte der Erweiterung Zugriff auf cake.ski erlauben.': 'Please allow the extension to access cake.ski.',
  'Upload-Tab nicht erreichbar. Bitte cake.ski neu laden.': 'Upload tab unavailable. Please reload cake.ski.',
  'Upload-Formular nicht erreichbar. Bitte cake.ski neu laden.': 'Upload form unavailable. Please reload cake.ski.',
  'Upload-Formular nicht erreichbar. cake.ski nach dem Laden der Erweiterung neu laden.': 'Upload form unavailable. Reload cake.ski after loading the extension.',
  'Einstellungen nicht erreichbar.': 'Settings unavailable.', 'Einstellungen konnten nicht gespeichert werden.': 'Settings could not be saved.',
  'Pro Video sind maximal 250 MB möglich.': 'Each video can be up to 250 MB.', 'Browser-Erkennung konnte nicht starten.': 'Browser analysis could not start.',
  'Das Video lässt sich im Browser nicht lesen.': 'The browser cannot read this video.', 'Das Lesen des Videos dauert zu lange.': 'Reading the video took too long.',
  'Ungültige Videolänge oder Auflösung.': 'Invalid video duration or resolution.', 'Anfrage fehlgeschlagen.': 'Request failed.',
  'Lokale Tag-Vorschläge': 'Local tag suggestions', 'Öffnen': 'Open', 'Cake Tagger Startseite': 'Cake Tagger home', 'Videoergebnisse': 'Video results'
};
const patterns = [
  [/^(\d+) Bilder$/, (_, n) => `${n} images`],
  [/^(\d+) Videos · (\d+) analysiert$/, (_, n, done) => `${n} videos · ${done} analyzed`],
  [/^(\d+) ausgewählt$/, (_, n) => `${n} selected`],
  [/^Analysiere Bild (\d+) \/ (\d+) …$/, (_, n, total) => `Analyzing image ${n} / ${total} …`],
  [/^(\d+) Vorschaubilder werden analysiert …$/, (_, n) => `Analyzing ${n} preview images …`],
  [/^Gespeichertes Ergebnis geladen · (\d+) Bilder · bitte prüfen$/, (_, n) => `Cached result loaded · ${n} images · please review`],
  [/^Analyse abgeschlossen · (\d+) Bilder · ([\d.]+) s · bitte prüfen$/, (_, n, seconds) => `Analysis complete · ${n} images · ${seconds} s · please review`],
  [/^Vorschaubild (\d+) von (\d+)$/, (_, n, total) => `Preview ${n} of ${total}`],
  [/^Vorschaubild (\d+) vergrößern$/, (_, n) => `Enlarge preview ${n}`],
  [/^Vorschaubild (\d+)$/, (_, n) => `Preview ${n}`],
  [/^Tag ergänzen für (.+)$/, (_, name) => `Add tag for ${name}`],
  [/^ · erkannt in (\d+) von (\d+) Vorschaubildern$/, (_, n, total) => ` · detected in ${n} of ${total} preview images`],
  [/^(\d+) Tags ergänzt · (\d+) bereits vorhanden oder ausgeschlossen\.$/, (_, n, skipped) => `${n} tags added · ${skipped} already present or excluded.`],
  [/^Übernahme fehlgeschlagen: (.+)$/, (_, error) => 'Transfer failed: ' + t(error)],
  [/^Export fehlgeschlagen: (.+)$/, (_, error) => 'Export failed: ' + t(error)]
];
export function setLanguage(settings, browserLanguage = globalThis.navigator?.language || 'de') {
  language = resolvedLanguage(settings, browserLanguage); return language;
}
export function t(value) {
  if (language !== 'en' || typeof value !== 'string') return value;
  if (Object.hasOwn(english, value)) return english[value];
  for (const [pattern, replace] of patterns) if (pattern.test(value)) return value.replace(pattern, replace);
  return value;
}
export function translatePage(root = document) {
  document.documentElement.lang = language;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attribute of ['aria-label', 'placeholder']) {
    for (const el of root.querySelectorAll(`[data-i18n-${attribute}]`)) el.setAttribute(attribute, t(el.getAttribute('data-i18n-' + attribute)));
  }
}
