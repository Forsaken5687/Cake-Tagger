# Chrome-Erweiterung

Voraussetzung: Chrome Desktop ab Version 120. Das Paket enthält Modell und Runtime und arbeitet ohne lokalen Dienst.

## Laden

1. `outputs/Cake-Tagger-Chrome.zip` entpacken. Bei einer lokalen Entwicklung ist `outputs/chrome/` bereits entpackt.
2. `chrome://extensions` öffnen und **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** anklicken und den Ordner mit der `manifest.json` auswählen.
4. Den cake.ski-Tab neu laden und den Upload-Bereich öffnen.

Bei einem Update zuerst die Paketdateien ersetzen, dann die Erweiterung auf `chrome://extensions` neu laden und cake.ski neu laden. Auswahlen in einer laufenden Analyse gehen beim Neuladen verloren. Gespeicherte Einstellungen bleiben erhalten.

## Verwenden

1. Videos im Upload-Bereich auf cake.ski auswählen. Bulk kann dabei bereits Upload-Entwürfe erstellen.
2. Bei Cake Tagger **Öffnen** anklicken, dann **Tags vorschlagen**.
3. Vorschläge prüfen und bei jeder Datei **Tags auf cake.ski ergänzen** anklicken.

Single und Bulk werden unterstützt. Die Erweiterung ergänzt ausgewählte Tags; vorhandene Tags und gemeinsame Tag-Ausschlüsse bleiben erhalten. Sie betätigt keine Veröffentlichungsbuttons. Der Website-Upload selbst bleibt Teil des normalen cake.ski-Ablaufs.

Das Erweiterungssymbol öffnet direkt eine separate Analyseansicht mit JSON-Download. **Einstellungen** ist dort und im eingebetteten Upload-Bereich verfügbar. Beide Ansichten teilen Sprache, Bildanzahl, Tag-Ausschlüsse und Anzeigeoptionen. Chrome und Firefox verwalten ihre Einstellungen getrennt.

Dateien, die vor dem Laden der Erweiterung ausgewählt wurden, erneut auswählen. Die Zuordnung zum Upload-Feld erfolgt über den exakten Dateinamen. Bei doppelten Namen stoppt die Übernahme. Bilder-Sets werden nicht unterstützt.

## Entwicklung und Prüfung

`runtime/node.exe scripts/Build-Chrome.mjs` erstellt den entpackten Ordner und das ZIP-Paket. Der gemeinsame Paketbau kontrolliert Modell und Runtime anhand der festgelegten Prüfsummen und übernimmt ausschließlich freigegebene Dateien einschließlich Lizenzhinweisen. Die PNG-Icons sind aus dem eigenen SVG-Logo abgeleitet.

Chrome verwendet einen Modul-Service-Worker mit statischen Imports. Eine kleine gemeinsame API-Anpassung überbrückt asynchrone Antworten über `sendResponse`, ohne von der Chrome-Version für Promise-Rückgaben in Nachrichten-Listenern abhängig zu sein. Analyse und Videoverarbeitung laufen in der sichtbaren Erweiterungsansicht und ihrem Worker; ein ruhender Hintergrunddienst unterbricht die Analyse nicht.

Automatische Tests prüfen Nachrichten, Absendergrenzen, Einstellungen und Manifest. Eine lokale Browserprüfung ersetzt nicht das Laden der Erweiterung in Chrome mit der realen Website.

Referenzen: [Chrome-Service-Worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics), [Nachrichtenübertragung](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [PNG-Icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons).
