// Shared UI messages for page, worker errors and the content-script header.
export const english = {
  'Upload-Videos automatisch analysieren': 'Automatically analyze upload videos',
  'Vorschläge': 'Suggestions', 'Tags übernehmen': 'Apply tags', 'Automatisch': 'Automatic',
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
const englishPatterns = [
  [/^Ausschluss entfernen: (.+)$/, (_, tag) => 'Remove exclusion: ' + tag],
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
  [/^Übernahme fehlgeschlagen: (.+)$/, (_, error) => 'Transfer failed: ' + translate(error, 'en')],
  [/^Export fehlgeschlagen: (.+)$/, (_, error) => 'Export failed: ' + translate(error, 'en')]
];

Object.assign(english, {
  "Ungültige Tag-Auswahl.": "Invalid tag selection.",
  "Ungültige Tag-Übernahme.": "Invalid tag transfer.",
  "Upload-Tab stimmt nicht überein.": "Upload tab does not match.",
  "Mehrere Uploads haben diesen Dateinamen. Bitte einzeln übernehmen.": "Multiple uploads have this filename. Apply tags individually.",
  "Keine passende Datei im Upload-Formular gefunden.": "No matching file found in the upload form.",
  "Im Tag-Feld steht noch eine Eingabe. Bitte zuerst übernehmen oder leeren.": "The tag field contains unfinished input. Apply or clear it first.",
  "Das Upload-Formular wurde während der Übernahme geändert.": "The upload form changed during tag transfer.",
  "Die Tag-Eingabe wurde während der Übernahme geändert.": "The tag input changed during tag transfer.",
  "Eine Tag-Übernahme läuft bereits.": "A tag transfer is already in progress.",
  "Ungültiges Modellbild.": "Invalid model input image.",
  "Modellausgabe passt nicht zur Tagliste.": "Model output does not match the tag list.",
  "Ungültige Videolänge.": "Invalid video duration.",
  "Videos dürfen höchstens 10 Minuten lang sein.": "Videos must be no longer than 10 minutes.",
  "Ungültige Bildanzahl.": "Invalid frame count.",
  "Ungültige zeitliche Abdeckung.": "Invalid temporal coverage.",
  "Ungültige Analysezeiten.": "Invalid analysis timings.",
  "Ungültige Analyse-Regel.": "Invalid analysis policy.",
  "Ungültige Tags in der Korrektur.": "Invalid tags in the correction.",
  "Ungültige Dateizuordnung.": "Invalid file association.",
  "Ungültige Bildauswahl.": "Invalid frame selection.",
  "Ungültige Analyseangaben.": "Invalid analysis data.",
  "Ungültige Modell-Scores.": "Invalid model scores.",
  "Ungültige unsichere Modell-Scores.": "Invalid uncertain model scores.",
  "Ungültige Tag-Herkunft.": "Invalid tag origin.",
  "Bitte die Oberfläche über Start.cmd öffnen.": "Please open the application using Start.cmd.",
  "Download abgelaufen. Bitte den Download erneut erstellen.": "Download expired. Please create it again.",
  "JSON erwartet.": "Expected JSON.",
  "Export zu groß.": "Export is too large.",
  "Keine gültigen Ergebnisse.": "No valid results.",
  "Ungültiger Port.": "Invalid port.",
  "Keine Videos ausgewählt.": "No videos selected.",
  "cake.ski Upload-Tab": "cake.ski upload tab",
  "Fehler beim Laden der Anwendung.": "Application could not be loaded.",
  "Netzwerkanfrage fehlgeschlagen.": "Failed to fetch",
  "Nicht unterstützte Einstellungsnachricht.": "Unsupported settings message.",
  "Ungültige Sitzungsadresse.": "Invalid session URL."
});
english["Cake Tagger – Tag-Vorschläge"] = "Cake Tagger – tag suggestions";
const german = Object.fromEntries(Object.entries(english).map(([de, en]) => [en, de]));
const germanPatterns = [
  [/^Remove exclusion: (.+)$/, (_, tag) => 'Ausschluss entfernen: ' + tag],
  [/^(\d+) images$/, (_, n) => `${n} Bilder`],
  [/^(\d+) videos? · (\d+) analyzed$/, (_, n, done) => `${n} Videos · ${done} analysiert`],
  [/^(\d+) selected$/, (_, n) => `${n} ausgewählt`],
  [/^Analyzing image (\d+) \/ (\d+) …$/, (_, n, total) => `Analysiere Bild ${n} / ${total} …`],
  [/^Analyzing (\d+) preview images …$/, (_, n) => `${n} Vorschaubilder werden analysiert …`],
  [/^Cached result loaded · (\d+) images · please review$/, (_, n) => `Gespeichertes Ergebnis geladen · ${n} Bilder · bitte prüfen`],
  [/^Analysis complete · (\d+) images · ([\d.]+) s · please review$/, (_, n, seconds) => `Analyse abgeschlossen · ${n} Bilder · ${seconds} s · bitte prüfen`],
  [/^Preview (\d+) of (\d+)$/, (_, n, total) => `Vorschaubild ${n} von ${total}`],
  [/^Enlarge preview (\d+)$/, (_, n) => `Vorschaubild ${n} vergrößern`],
  [/^Preview (\d+)$/, (_, n) => `Vorschaubild ${n}`],
  [/^Add tag for (.+)$/, (_, name) => `Tag ergänzen für ${name}`],
  [/^ · detected in (\d+) of (\d+) preview images$/, (_, n, total) => ` · erkannt in ${n} von ${total} Vorschaubildern`],
  [/^(\d+) tags added · (\d+) already present or excluded\.$/, (_, n, skipped) => `${n} Tags ergänzt · ${skipped} bereits vorhanden oder ausgeschlossen.`],
  [/^Transfer failed: (.+)$/, (_, error) => 'Übernahme fehlgeschlagen: ' + translate(error, 'de')],
  [/^Export failed: (.+)$/, (_, error) => 'Export fehlgeschlagen: ' + translate(error, 'de')],
  [/^Analysis failed: (.+)$/, (_, error) => 'Analyse fehlgeschlagen: ' + translate(error, 'de')],
  [/^"(.+)" was not accepted by the site\. Previously added tags are preserved\.$/, (_, tag) => `"${tag}" wurde von der Seite nicht übernommen. Bereits ergänzte Tags bleiben erhalten.`]
];
// Translate semantic UI messages, not tag names or filenames. Values stay language-neutral in state.
export function translate(value, language) {
  if (typeof value !== 'string') return value;
  const dictionary = language === 'de' ? german : english;
  if (Object.hasOwn(dictionary, value)) return dictionary[value];
  for (const [pattern, replace] of language === 'de' ? germanPatterns : englishPatterns) {
    if (pattern.test(value)) return value.replace(pattern, replace);
  }
  return value;
}
