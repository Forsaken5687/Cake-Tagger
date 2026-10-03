# Firefox-Erweiterung

Die erste Erweiterungsfassung verwendet dieselbe lokale Analyse und Tag-Auswahl wie die eigenständige Anwendung. Modell und Runtime werden mitgeliefert. `Start.cmd`, ein lokaler Dienst oder zusätzliche KI-Software sind für die Erweiterung nicht erforderlich.

## Laden

Voraussetzung: Firefox Desktop ab Version 140. Die Fassung ist noch unsigniert und wird vorläufig geladen:

1. `outputs/Cake-Tagger-Firefox.zip` entpacken.
2. In Firefox `about:debugging#/runtime/this-firefox` öffnen.
3. **Temporäres Add-on laden** anklicken und die entpackte `manifest.json` auswählen.
4. Zugriff auf `https://cake.ski` erlauben, falls Firefox danach fragt. Einen bereits offenen cake.ski-Tab neu laden.
5. Auf cake.ski den Upload-Bereich öffnen. Dort erscheint **Cake Tagger** mit der Schaltfläche **Öffnen**.

Firefox entfernt vorläufig geladene Add-ons beim Neustart. Für eine dauerhaft installierbare Ausgabe ist später eine Signierung erforderlich. Das Projekt veröffentlicht oder übermittelt das Paket nicht automatisch.

Nach einem Paket-Update bei `about:debugging#/runtime/this-firefox` die Erweiterung **Neu laden** und anschließend den cake.ski-Tab neu laden. Bei einer entpackten ZIP-Ausgabe zuvor die Dateien durch das neue Paket ersetzen.

## Verwenden

1. Videos auf cake.ski im Upload-Bereich auswählen. Die Seite erstellt bei Bulk bereits dabei Upload-Entwürfe.
2. Bei **Cake Tagger** auf **Öffnen** klicken. Die dort ausgewählten Dateien werden automatisch in die eingebettete Analyse übernommen.
3. **Tags vorschlagen** anklicken und anschließend die Vorschläge prüfen, abwählen oder ergänzen.
4. Bei jedem Video **Tags auf cake.ski ergänzen** anklicken.

Single und Bulk verwenden dieselbe eingebettete Ansicht. Sie bleibt beim Wechsel von Single zu Bulk geöffnet. Neue Dateien kommen hinzu, entfernte Dateien verschwinden aus der Auswahl; vorhandene Ergebnisse und Korrekturen bleiben für unveränderte Dateien erhalten. **Schließen** blendet die Ansicht aus, ohne die Sitzung zu löschen. Beim Neuladen von cake.ski beginnt eine neue Sitzung. Dateien, die vor dem Laden der Erweiterung ausgewählt wurden, müssen erneut im Upload-Bereich ausgewählt werden.

Die Erweiterungsschaltfläche öffnet direkt eine separate Analyseansicht. Sprache, Bildanzahl, Tag-Ausschlüsse und die Anzeige von Scores bzw. unsicheren Vorschlägen sind über **Einstellungen** in der separaten und der eingebetteten Analyseansicht erreichbar. Alle Firefox-Ansichten verwenden dieselben gespeicherten Einstellungen. Dort können Dateien unabhängig ausgewählt und Ergebnisse als JSON heruntergeladen werden; für eine Tag-Übernahme den gewünschten Upload-Tab auswählen.

Die Erweiterung ergänzt nur ausgewählte Tags und erhält vorhandene Tags. Gemeinsame Bulk-Tags zählen als vorhanden. Für eine Karte ausgeschlossene gemeinsame Tags werden übersprungen. Beschreibungen, Performer, Upload-Fragen und Bestätigungen bleiben unverändert. Die erforderlichen Fragen in Single bleiben separat auszufüllen.

Die Dateinamen müssen exakt übereinstimmen. Bei mehreren passenden Karten stoppt die Übernahme; solche Dateien einzeln bearbeiten. Dies ist eine Zuordnung über Namen, keine Bestätigung identischer Dateiinhalte. Bilder-Sets werden nicht unterstützt.

Es werden keine Dateien an cake.ski übergeben und keine Veröffentlichungsbuttons betätigt. Beim Ergänzen von Tags können die normalen Suchanfragen der Website ausgelöst werden. Deshalb deklariert die Erweiterung Website-Inhalte in Firefox als Datenkategorie. Es gibt keine Telemetrie und keinen eigenen externen Dienst; Videos und Vorschaubilder bleiben in der Analyseansicht.

Auswahlen bleiben bis zum Neuladen im Arbeitsspeicher. **JSON herunterladen** in der separaten Ansicht exportiert die Ergebnisse ohne lokalen Dienst.

## Entwicklung

`runtime/node.exe scripts/Build-Firefox.mjs` erzeugt den entpackten Ordner `outputs/firefox/` und das ZIP-Paket. Das Werkzeug kopiert nur eine feste Liste und kontrolliert die großen Abhängigkeiten anhand von `scripts/assets.json`. Private Daten, Videos und die Node-Laufzeit werden nicht aufgenommen. Die Drittanbieter-Lizenzen und Metadaten bleiben enthalten.

Die Browserprüfung des Adapters verwendet Single und Bulk sowie die originale Typeahead-Komponente in einer lokalen Kopie. Dabei sind externe Verbindungen gesperrt. Geprüft sind synthetische Enter-Ereignisse, doppelte Tags und ausgeschlossene gemeinsame Tags; die Mitgliederrolle verwendet lokale Suchantworten. Die vollständige Erweiterung muss noch in Firefox auf Laden, Analyse und Übernahme geprüft werden; der In-App-Browser ersetzt diese Prüfung nicht.

Die gemeinsame Erweiterungsoberfläche wurde zusätzlich mit einer lokal nachgebildeten Browser-Anbindung geprüft: Ein Video wurde ohne lokalen Export-Dienst analysiert, und der JSON-Download enthielt die ausgewählten Tags. Diese Prüfung bestätigt weder Firefox-Berechtigungen noch die tatsächliche Nachrichtenübermittlung zwischen Erweiterung und Website.

Die eingebettete Variante wurde in einer lokalen Upload-Kopie mit zwei verschiedenen Ursprüngen geprüft: Übernahme der Upload-Dateiauswahl, Modellanalyse, Rückübernahme in Single, Wechsel zu Bulk bei erhaltener Analyse, kartenspezifische Übernahme einschließlich gemeinsamer Tag-Ausschlüsse, Entfernen einer Datei und Erhalt der Sitzung beim Schließen und Wiederöffnen. Die Browser-Anbindung war hierbei nachgebildet; die direkte Firefox-Prüfung der eingebetteten Variante steht noch aus.
