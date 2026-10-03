# Browser-Integration

Eine erste Firefox-Erweiterung ist implementiert. Einrichtung und Grenzen stehen unter [Firefox](FIREFOX.md). Die vollständige Prüfung in Firefox steht noch aus; Eine Chrome-Fassung mit demselben Analysecode und einem Modul-Service-Worker ist verfügbar; Einrichtung und Prüfgrenzen stehen unter [Chrome](CHROME.md). Die eigenständige Oberfläche bleibt verfügbar.

## Upload-Ansichten

Die folgenden Schnittstellen wurden anhand der Upload-Oberfläche und des öffentlich ausgelieferten Seitencodes geprüft. Sie sind keine stabile API und müssen bei Änderungen der Seite erneut geprüft werden.

| Ansicht | Tag-Ziel | Besonderheiten |
| --- | --- | --- |
| Single | `.stok-up .stok-pillfield` für Tags | Ein Video oder bis zu zehn Bilder als ein Beitrag; zusätzliche Fragen ergänzen Tags. Performer-Feld getrennt behandeln. |
| Bulk | Tag-Feld innerhalb jeder `.stok-bulk-card` | `.stok-bulk-name` zeigt den Dateinamen. Gemeinsame Tags und Performer stehen außerhalb der Karten. |

Die Eingaben sind Typeahead-Felder mit der Klasse `.stok-ta-input`. Die tatsächliche Auswahl liegt im Zustand der Seite; allein das Setzen des Eingabewerts übernimmt keinen Tag. Tags müssen über den vorgesehenen Eingabe-/Auswahlweg hinzugefügt und anhand der sichtbaren Pills bestätigt werden. Mitglieder wählen bestehende Tags; höhere Rollen können Tags direkt übernehmen. Beide Wege benötigen getrennte Prüfungen.

Single wechselt bei mehreren ausgewählten Dateien mit mindestens einem Video automatisch zu Bulk. Bis zu zehn reine Bilddateien bleiben zunächst ein gemeinsamer Beitrag.

**Bulk überträgt Dateien bereits nach der Auswahl als Server-Entwürfe.** Der abschließende Veröffentlichungsbutton ist nicht der Beginn der Dateiübertragung. Eine Prüfung ohne Upload darf deshalb keine Dateien im echten Bulk-Formular auswählen.

## Vorgesehener Ablauf

1. Upload-Dateiauswahl in die eingebettete Erweiterungsansicht übernehmen und lokal mit der vorhandenen Engine analysieren.
2. Vorschläge prüfen und auswählen.
3. Ausgewählte Tags dem passenden Single-Feld oder der passenden Bulk-Karte zuordnen.
4. Bestehende Tags erhalten und doppelte Einträge vermeiden. Gemeinsame Bulk-Tags bei jeder Karte berücksichtigen. Ausdrücklich für eine Karte entfernte gemeinsame Tags nicht automatisch wieder ergänzen.

Die Erweiterung soll weder Dateien an die Website übergeben noch Upload-, Veröffentlichungs- oder Bestätigungsbuttons bedienen. Die Dateiauswahl auf cake.ski bleibt eine bewusste Handlung des Nutzers. Bei doppelten Dateinamen, fehlenden Karten oder unklarer Zuordnung ist eine Auswahl erforderlich; Tags dürfen nicht anhand der Reihenfolge geraten werden.

## Firefox

Modell, Runtime und Tag-Regeln sollen dieselben festgelegten Versionen wie die eigenständige Anwendung verwenden. Analysecode und Modell gehören zur Erweiterung, nicht zum Seitencode. Das Modell wird nicht pro Video heruntergeladen. Die Firefox-Fassung soll keine Chrome-spezifischen Offscreen-APIs voraussetzen.

Firefox unterstützt bei Manifest V3 Hintergrundskripte statt Chrome-Service-Worker. Für WebAssembly ist eine entsprechende Erweiterungs-CSP erforderlich. Die endgültige Architektur und Leistung müssen in Firefox geprüft werden; eine Prüfung im In-App-Browser ersetzt dies nicht.

Referenzen: [Mozilla: Hintergrundskripte](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [Mozilla: Content Security Policy](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_security_policy).

## Prüfung ohne Upload

Eine lokale Prüfansicht verwendet die Upload-Renderer des ausgelieferten Seitencodes mit ersetzten API-Aufrufen und Hilfsfunktionen. Ihre CSP sperrt externe Verbindungen und Formularübermittlungen. Künstliche Dateien dienen ausschließlich der Prüfung von Single-/Bulk-Wechsel und getrennten Tag-Feldern. Seitencode und Versuchsdateien bleiben unter ignoriertem `work/`; sie werden nicht mit dem Projekt ausgeliefert.

Geprüft: Eine Datei bleibt Single, eine zweite Videodatei erzeugt zwei Bulk-Karten. Ein gemeinsamer Tag erscheint bei beiden Karten; ein zusätzlicher Kartentag nur bei seiner Karte.

Dies wurde zusätzlich im echten Upload-Formular mit der Maintainer-Rolle bestätigt: Enter übernimmt einen Tag in die Auswahl und aktualisiert den Zähler. Zwei Videodateien wechseln automatisch auf Bulk und werden bereits vor dem Veröffentlichen als Entwürfe übertragen. Ein gemeinsamer Tag lässt sich für eine einzelne Karte entfernen, ohne die zweite Karte zu ändern. Die Test-Entwürfe wurden über die Entfernen-Schaltflächen verworfen und die Ansicht anschließend in den leeren Single-Zustand zurückgesetzt. Es wurde nichts veröffentlicht.

Der Adapter wurde zusätzlich mit synthetischen Enter-Ereignissen gegen die originale Typeahead-Komponente in einer lokalen Kopie geprüft. Single und Bulk übernehmen Tags; erneute Übernahme erzeugt keine Duplikate, und gemeinsame Tag-Ausschlüsse werden erhalten. Doppelte Dateinamen werden als unklare Zuordnung abgewiesen. Noch offen: die vollständige Firefox-Prüfung mit Content-Script, eingebundener Analyse-Engine und Mitgliederrolle.
