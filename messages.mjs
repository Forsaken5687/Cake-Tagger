// Stable message IDs keep wording and runtime data independent of each other.
export const messages = {
  'error.nativeServer': { en: 'Start Cake Tagger with Start.cmd to connect to the local analysis server.', de: 'Starte Cake Tagger mit Start.cmd, um den lokalen Analyseserver zu verbinden.' },
  'error.nativeInference': { en: 'Local analysis failed. Check the server and run Setup.cmd if dependencies are missing.', de: 'Lokale Analyse fehlgeschlagen. Prüfe den Server und starte Setup.cmd, falls Abhängigkeiten fehlen.' },
  'error.nativeBusy': { en: 'The local analysis server is busy. Try again shortly.', de: 'Der lokale Analyseserver ist ausgelastet. Versuche es gleich noch einmal.' },
  'error.nativeModelChecksum': { en: 'Model checksum mismatch. Run Setup.cmd to restore the model.', de: 'Die Modell-Prüfsumme stimmt nicht. Stelle das Modell mit Setup.cmd wieder her.' },
  'settings.parallelism': { en: 'CPU parallelism', de: 'CPU-Parallelisierung' },
  'settings.parallelismCount': { en: 'Up to {count}', de: 'Bis zu {count}' },
  'settings.parallelismHint': { en: 'CPU thread limit for the local server. Automatic uses up to half the available logical processors, capped at eight. Higher limits are not always faster.', de: 'CPU-Thread-Limit für den lokalen Server. Automatisch nutzt bis zur Hälfte der verfügbaren logischen Prozessoren, höchstens acht. Höhere Limits sind nicht immer schneller.' },
  // Runtime diagnostics.
  'diagnostics.title': { en: 'Runtime diagnostics', de: 'Laufzeit-Diagnose' },
  'diagnostics.description': { en: 'Check CPU runtime settings and optionally measure one synthetic image. No videos are needed.', de: 'Prüfe die CPU-Laufzeit und miss optional ein künstliches Testbild. Dafür werden keine Videos benötigt.' },
  'diagnostics.run': { en: 'Run performance test', de: 'Geschwindigkeit testen' },
  'diagnostics.download': { en: 'Download diagnostics', de: 'Diagnose herunterladen' },
  'diagnostics.running': { en: 'Measuring one image …', de: 'Messe ein Bild …' },
  // Action messages.
  'action.add': { en: 'Add', de: 'Hinzufügen' },
  'action.close': { en: 'Close', de: 'Schließen' },
  'action.defaults': { en: 'Defaults', de: 'Standardwerte' },
  'action.next': { en: 'Next', de: 'Weiter' },
  'action.open': { en: 'Open', de: 'Öffnen' },
  'action.previous': { en: 'Previous', de: 'Zurück' },
  'action.quit': { en: 'Quit', de: 'Programm beenden' },
  'action.save': { en: 'Save', de: 'Speichern' },

  // Analysis messages.
  'analysis.cached': { en: 'Cached result loaded · {count} images · please review', de: 'Gespeichertes Ergebnis geladen · {count} Bilder · bitte prüfen' },
  'analysis.cancel': { en: 'Cancel analysis', de: 'Analyse abbrechen' },
  'analysis.cancelled': { en: 'Cancelled', de: 'Abgebrochen' },
  'analysis.cancelledHint': { en: 'Analysis cancelled. Completed results are preserved.', de: 'Analyse abgebrochen. Fertige Ergebnisse bleiben erhalten.' },
  'analysis.complete': {
    en: 'Analysis complete · {count} images · {seconds} s · please review',
    de: 'Analyse abgeschlossen · {count} Bilder · {seconds} s · bitte prüfen'
  },
  'analysis.connecting': { en: 'Checking connection …', de: 'Verbindung wird geprüft …' },
  'analysis.failed': { en: 'Analysis failed', de: 'Analyse fehlgeschlagen' },
  'analysis.frameProgress': { en: 'Analyzing {count} preview images …', de: '{count} Vorschaubilder werden analysiert …' },
  'analysis.loadingModel': { en: 'Loading tagging model …', de: 'Kleines Tagging-Modell wird geladen …' },
  'analysis.preparing': { en: 'Preparing videos …', de: 'Videos werden vorbereitet …' },
  'analysis.progress': { en: 'Analyzing image {current} / {total} …', de: 'Analysiere Bild {current} / {total} …' },
  'analysis.ready': { en: 'Ready', de: 'Bereit' },
  'analysis.restored': { en: 'Selection restored from this session', de: 'Auswahl aus dieser Sitzung übernommen' },
  'analysis.sampling': { en: 'Reading preview images …', de: 'Vorschaubilder werden gelesen …' },
  'analysis.start': { en: 'Suggest tags', de: 'Tags vorschlagen' },
  'analysis.stopped': { en: 'Stopped', de: 'Programm beendet' },
  'analysis.title': { en: 'Analysis', de: 'Analyse' },
  'analysis.waiting': { en: 'Waiting for analysis', de: 'Wartet auf Analyse' },

  // Embed messages.
  'embed.title': { en: 'Cake Tagger – tag suggestions', de: 'Cake Tagger – Tag-Vorschläge' },

  // Error messages.
  'error.analysisStart': { en: 'Browser analysis could not start.', de: 'Browser-Erkennung konnte nicht starten.' },
  'error.chooseExclusion': { en: 'Please choose a tag from the list.', de: 'Bitte einen Tag aus der Liste wählen.' },
  'error.chooseTab': { en: 'Please choose a cake.ski tab.', de: 'Bitte einen cake.ski-Tab auswählen.' },
  'error.chooseTag': { en: 'Please choose a tag from the available list.', de: 'Bitte einen Tag aus deiner vorhandenen Liste wählen.' },
  'error.downloadExpired': { en: 'Download expired. Please create it again.', de: 'Download abgelaufen. Bitte den Download erneut erstellen.' },
  'error.duplicateFilename': {
    en: 'Multiple uploads have this filename. Apply tags individually.',
    de: 'Mehrere Uploads haben diesen Dateinamen. Bitte einzeln übernehmen.'
  },
  'error.expectedJson': { en: 'Expected JSON.', de: 'JSON erwartet.' },
  'error.exportFailed': { en: 'Export failed: {error}', de: 'Export fehlgeschlagen: {error}' },
  'error.exportIsTooLarge': { en: 'Export is too large.', de: 'Export zu groß.' },
  'error.invalidAnalysisData': { en: 'Invalid analysis data.', de: 'Ungültige Analyseangaben.' },
  'error.invalidAnalysisPolicy': { en: 'Invalid analysis policy.', de: 'Ungültige Analyse-Regel.' },
  'error.invalidAnalysisTimings': { en: 'Invalid analysis timings.', de: 'Ungültige Analysezeiten.' },
  'error.invalidAnalysisRuntime': { en: 'Invalid analysis runtime details.', de: 'Ungültige Angaben zur Analyse-Laufzeit.' },
  'error.invalidFileAssociation': { en: 'Invalid file association.', de: 'Ungültige Dateizuordnung.' },
  'error.invalidFrameCount': { en: 'Invalid frame count.', de: 'Ungültige Bildanzahl.' },
  'error.invalidFrameSelection': { en: 'Invalid frame selection.', de: 'Ungültige Bildauswahl.' },
  'error.invalidModelInputImage': { en: 'Invalid model input image.', de: 'Ungültiges Modellbild.' },
  'error.invalidModelScores': { en: 'Invalid model scores.', de: 'Ungültige Modell-Scores.' },
  'error.invalidPort': { en: 'Invalid port.', de: 'Ungültiger Port.' },
  'error.invalidSessionUrl': { en: 'Invalid session URL.', de: 'Ungültige Sitzungsadresse.' },
  'error.invalidTagOrigin': { en: 'Invalid tag origin.', de: 'Ungültige Tag-Herkunft.' },
  'error.invalidTagSelection': { en: 'Invalid tag selection.', de: 'Ungültige Tag-Auswahl.' },
  'error.invalidTagTransfer': { en: 'Invalid tag transfer.', de: 'Ungültige Tag-Übernahme.' },
  'error.invalidTagsInTheCorrection': { en: 'Invalid tags in the correction.', de: 'Ungültige Tags in der Korrektur.' },
  'error.invalidTemporalCoverage': { en: 'Invalid temporal coverage.', de: 'Ungültige zeitliche Abdeckung.' },
  'error.invalidUncertainModelScores': { en: 'Invalid uncertain model scores.', de: 'Ungültige unsichere Modell-Scores.' },
  'error.invalidVideoDuration': { en: 'Invalid video duration.', de: 'Ungültige Videolänge.' },
  'error.invalidVideoDurationOrResolution': { en: 'Invalid video duration or resolution.', de: 'Ungültige Videolänge oder Auflösung.' },
  'error.missingUpload': { en: 'No matching file found in the upload form.', de: 'Keine passende Datei im Upload-Formular gefunden.' },
  'error.modelOutput': { en: 'Model output does not match the tag list.', de: 'Modellausgabe passt nicht zur Tagliste.' },
  'error.noSelectedTags': { en: 'Please select at least one tag.', de: 'Bitte mindestens einen Tag auswählen.' },
  'error.noValidResults': { en: 'No valid results.', de: 'Keine gültigen Ergebnisse.' },
  'error.noVideosSelected': { en: 'No videos selected.', de: 'Keine Videos ausgewählt.' },
  'error.openUsingStart': { en: 'Please open the application using Start.cmd.', de: 'Bitte die Oberfläche über Start.cmd öffnen.' },
  'error.reloadUploadForm': {
    en: 'Upload form unavailable. Reload cake.ski after loading the extension.',
    de: 'Upload-Formular nicht erreichbar. cake.ski nach dem Laden der Erweiterung neu laden.'
  },
  'error.requestFailed': { en: 'Request failed.', de: 'Anfrage fehlgeschlagen.' },
  'error.settingsSave': { en: 'Settings could not be saved.', de: 'Einstellungen konnten nicht gespeichert werden.' },
  'error.settingsUnavailable': { en: 'Settings unavailable.', de: 'Einstellungen nicht erreichbar.' },
  'error.sitePermission': { en: 'Please allow the extension to access cake.ski.', de: 'Bitte der Erweiterung Zugriff auf cake.ski erlauben.' },
  'error.tagInputChanged': { en: 'The tag input changed during tag transfer.', de: 'Die Tag-Eingabe wurde während der Übernahme geändert.' },
  'error.tagRejected': {
    en: '"{tag}" was not accepted by the site. Previously added tags are preserved.',
    de: '"{tag}" wurde von der Seite nicht übernommen. Bereits ergänzte Tags bleiben erhalten.'
  },
  'error.transferBusy': { en: 'A tag transfer is already in progress.', de: 'Eine Tag-Übernahme läuft bereits.' },
  'error.transferFailed': { en: 'Transfer failed: {error}', de: 'Übernahme fehlgeschlagen: {error}' },
  'error.unfinishedTag': {
    en: 'The tag field contains unfinished input. Apply or clear it first.',
    de: 'Im Tag-Feld steht noch eine Eingabe. Bitte zuerst übernehmen oder leeren.'
  },
  'error.unknown': { en: 'An unexpected error occurred.', de: 'Ein unerwarteter Fehler ist aufgetreten.' },
  'error.unsupportedSettings': { en: 'Unsupported settings message.', de: 'Nicht unterstützte Einstellungsnachricht.' },
  'error.uploadChanged': { en: 'The upload form changed during tag transfer.', de: 'Das Upload-Formular wurde während der Übernahme geändert.' },
  'error.uploadFormUnavailable': { en: 'Upload form unavailable. Please reload cake.ski.', de: 'Upload-Formular nicht erreichbar. Bitte cake.ski neu laden.' },
  'error.uploadTabDoesNotMatch': { en: 'Upload tab does not match.', de: 'Upload-Tab stimmt nicht überein.' },
  'error.uploadTabUnavailable': { en: 'Upload tab unavailable. Please reload cake.ski.', de: 'Upload-Tab nicht erreichbar. Bitte cake.ski neu laden.' },
  'error.videoDecode': { en: 'The browser cannot read this video.', de: 'Das Video lässt sich im Browser nicht lesen.' },
  'error.videoDurationLimit': { en: 'Videos must be no longer than 10 minutes.', de: 'Videos dürfen höchstens 10 Minuten lang sein.' },
  'error.videoSize': { en: 'Each video can be up to 250 MB.', de: 'Pro Video sind maximal 250 MB möglich.' },
  'error.videoTimeout': { en: 'Reading the video took too long.', de: 'Das Lesen des Videos dauert zu lange.' },

  // Export messages.
  'export.description': { en: 'Download selected tags as JSON.', de: 'Ausgewählte Tags als JSON herunterladen.' },
  'export.download': { en: 'Download JSON', de: 'JSON herunterladen' },

  // Language messages.
  'language.de': { en: 'Deutsch', de: 'Deutsch' },
  'language.en': { en: 'English', de: 'English' },

  // Page messages.
  'page.description': { en: 'Tag suggestions for your videos.', de: 'Tag-Vorschläge für deine Videos.' },
  'page.home': { en: 'Cake Tagger home', de: 'Cake Tagger Startseite' },
  'page.sessionHint': { en: 'Results stay in this session until the page is reloaded.', de: 'Ergebnisse bleiben bis zum Neuladen in dieser Sitzung.' },
  'page.stoppedHint': { en: 'You can close this window.', de: 'Du kannst dieses Fenster schließen.' },
  'page.title': { en: 'Tag videos', de: 'Videos taggen' },

  // Preview messages.
  'preview.close': { en: 'Close preview', de: 'Vorschaubild schließen' },
  'preview.enlarge': { en: 'Enlarge preview {number}', de: 'Vorschaubild {number} vergrößern' },
  'preview.image': { en: 'Preview {number}', de: 'Vorschaubild {number}' },
  'preview.next': { en: 'Next preview', de: 'Nächstes Vorschaubild' },
  'preview.position': { en: 'Preview {current} of {total}', de: 'Vorschaubild {current} von {total}' },
  'preview.previous': { en: 'Previous preview', de: 'Vorheriges Vorschaubild' },

  // Results messages.
  'results.emptyEmbed': { en: 'Choose videos in the upload area.', de: 'Wähle Videos im Upload-Bereich aus.' },
  'results.emptyStandalone': { en: 'Choose videos to create your tag selection.', de: 'Wähle Videos aus, um deine Tag-Auswahl zusammenzustellen.' },
  'results.emptyTitle': { en: 'No videos yet', de: 'Noch keine Videos' },
  'results.label': { en: 'Video results', de: 'Videoergebnisse' },
  'results.legacyHint': {
    en: 'Restored from an old export. Original suggestions and scores are not fully known.',
    de: 'Aus altem Export übernommen. Ursprüngliche Vorschläge und Scores sind hier nicht vollständig bekannt.'
  },
  'results.noClearTags': {
    en: 'No sufficiently clear tags found. Please review manually.',
    de: 'Keine ausreichend klaren Tags gefunden. Bitte manuell prüfen.'
  },
  'results.suggestions': { en: 'Suggestions', de: 'Vorschläge' },
  'results.summary': { en: '{count} videos · {done} analyzed', de: '{count} Videos · {done} analysiert' },
  'results.summarySingle': { en: '{count} video · {done} analyzed', de: '{count} Video · {done} analysiert' },
  'results.title': { en: 'Videos & tags', de: 'Videos & Tags' },

  // Settings messages.
  'settings.autoAnalyze': { en: 'Automatically analyze upload videos', de: 'Upload-Videos automatisch analysieren' },
  'settings.autoFrames': { en: 'Automatic by video length', de: 'Automatisch nach Videolänge' },
  'settings.automatic': { en: 'Automatic', de: 'Automatisch' },
  'settings.excludeTag': { en: 'Exclude tag', de: 'Tag ausschließen' },
  'settings.exclusions': { en: 'Excluded tags', de: 'Ausgeschlossene Tags' },
  'settings.exclusionsHint': {
    en: 'Applies to new automatic suggestions. Manual tags and existing selections are preserved.',
    de: 'Gilt für neue automatische Vorschläge. Manuelle Tags und vorhandene Auswahlen bleiben erhalten.'
  },
  'settings.frameCount': { en: '{count} images', de: '{count} Bilder' },
  'settings.frames': { en: 'Images per video', de: 'Bilder pro Video' },
  'settings.language': { en: 'Language', de: 'Sprache' },
  'settings.removeExclusion': { en: 'Remove exclusion: {tag}', de: 'Ausschluss entfernen: {tag}' },
  'settings.scores': { en: 'Show scores', de: 'Scores anzeigen' },
  'settings.searchTags': { en: 'Search tags …', de: 'Tag suchen …' },
  'settings.title': { en: 'Settings', de: 'Einstellungen' },
  'settings.uncertain': { en: 'Show uncertain suggestions', de: 'Unsichere Vorschläge anzeigen' },

  // Tags messages.
  'tags.add': { en: 'Add', de: 'Ergänzen' },
  'tags.addForFile': { en: 'Add tag for {filename}', de: 'Tag ergänzen für {filename}' },
  'tags.added': { en: 'Added', de: 'Ergänzt' },
  'tags.frameSupport': { en: ' · detected in {count} of {total} preview images', de: ' · erkannt in {count} von {total} Vorschaubildern' },
  'tags.manualOrigin': { en: 'Added manually', de: 'Manuell ergänzt' },
  'tags.modelOrigin': { en: 'Original model suggestion', de: 'Ursprünglicher Modellvorschlag' },
  'tags.score': { en: 'Score {score} %', de: 'Score {score} %' },
  'tags.scoreHint': {
    en: 'Model score: average of the two strongest image matches. This is not a measured probability that the tag is correct.',
    de: 'Modellscore: Durchschnitt der zwei stärksten Bildtreffer. Keine gemessene Wahrscheinlichkeit für einen richtigen Tag.'
  },
  'tags.search': { en: 'Search for another tag …', de: 'Weiteren Tag suchen …' },
  'tags.selectedCount': { en: '{count} selected', de: '{count} ausgewählt' },
  'tags.selection': { en: 'Tag selection', de: 'Tag-Auswahl' },
  'tags.suggested': { en: 'Suggested', de: 'Vorschlag' },
  'tags.uncertain': { en: 'Uncertain', de: 'Unsicher' },
  'tags.unknown': { en: 'Unknown', de: 'Unbekannt' },
  'tags.unknownOrigin': { en: 'Origin not recorded in the old result', de: 'Herkunft im alten Ergebnis nicht dokumentiert' },

  // Transfer messages.
  'transfer.apply': { en: 'Apply tags', de: 'Tags übernehmen' },
  'transfer.complete': {
    en: '{count} tags added · {skipped} already present or excluded.',
    de: '{count} Tags ergänzt · {skipped} bereits vorhanden oder ausgeschlossen.'
  },
  'transfer.completeSingle': {
    en: '{count} tag added · {skipped} already present or excluded.',
    de: '{count} Tag ergänzt · {skipped} bereits vorhanden oder ausgeschlossen.'
  },
  'transfer.hint': {
    en: 'Choose the same videos on cake.ski, then add reviewed tags for each file.',
    de: 'Dieselben Videos auf cake.ski auswählen, dann die geprüften Tags pro Datei ergänzen.'
  },
  'transfer.noTab': { en: 'No cake.ski tab open', de: 'Kein cake.ski-Tab geöffnet' },
  'transfer.refresh': { en: 'Refresh tabs', de: 'Tabs aktualisieren' },
  'transfer.tab': { en: 'Upload tab', de: 'Upload-Tab' },
  'transfer.tabLabel': { en: 'cake.ski upload tab', de: 'cake.ski Upload-Tab' },
  'transfer.title': { en: 'Connect cake.ski', de: 'cake.ski verbinden' },

  // Upload messages.
  'upload.choose': { en: 'Choose videos', de: 'Videos auswählen' },
  'upload.chooseHint': { en: 'or click to choose files', de: 'oder klicken und Dateien auswählen' },
  'upload.drop': { en: 'Drop videos here', de: 'Videos hierher ziehen' },
  'upload.title': { en: 'New videos', de: 'Neue Videos' },
};

// Plain descriptors survive worker/runtime messaging without translating user data.
export function message(key, params = {}) { return { key, params }; }

export function translate(value, language, params = {}) {
  const key = typeof value === 'object' && value !== null ? value.key : value;
  const entry = Object.hasOwn(messages, key) ? messages[key] : null;
  if (!entry) return typeof value === 'string' ? value : '';
  const values = typeof value === 'object' ? value.params || {} : params;
  return entry[language === 'de' ? 'de' : 'en'].replace(/\{([a-zA-Z]+)\}/g, (placeholder, name) => {
    if (!Object.hasOwn(values, name)) return placeholder;
    const value = values[name];
    return typeof value === 'object' && value !== null ? translate(value, language) : String(value);
  });
}

// Error.message stays readable in logs; its descriptor preserves localization at UI boundaries.
export function messageError(value, params = {}) {
  const localizedMessage = typeof value === 'string' && Object.hasOwn(messages, value) ? message(value, params) : value;
  const error = new Error(translate(localizedMessage, 'en'));
  if (localizedMessage && typeof localizedMessage === 'object') error.localizedMessage = localizedMessage;
  return error;
}

export function errorMessage(error) {
  return error?.localizedMessage || (Object.hasOwn(messages, error?.message) ? message(error.message) : error?.message || message('error.unknown'));
}
