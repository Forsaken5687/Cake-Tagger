# Cake Tagger

Lokale Tag-Vorschläge für Videos, abgestimmt auf die mitgelieferte Tagliste von cake.ski. Die Anwendung analysiert einzelne Videobilder, lässt Vorschläge bearbeiten und speichert die Ergebnisse als JSON.

Das Projekt befindet sich in Entwicklung. Die Erkennungsqualität ist noch nicht systematisch gemessen. Die Firefox-Erweiterung zeigt lokale Tag-Vorschläge direkt im Upload-Bereich und ergänzt geprüfte Tags in Single- und Bulk-Feldern; sie veröffentlicht keine Beiträge. Die vollständige Firefox-Prüfung steht noch aus.

## Firefox-Erweiterung

Die Erweiterung arbeitet ohne lokalen Dienst und übernimmt Videos aus der Dateiauswahl im Upload-Bereich. Eine separate Analyseansicht bleibt optional verfügbar. Einrichtung, vorläufiges Laden und Nutzung stehen unter [Firefox](docs/FIREFOX.md). Die eigenständige Anwendung bleibt als zusätzliche Oberfläche verfügbar.

## Start

Voraussetzungen: Windows 64 Bit und ein aktueller Chrome- oder Edge-Browser mit WebAssembly und OffscreenCanvas. Die Analyse läuft auf der CPU.

1. Das vollständige Anwendungspaket in einen beschreibbaren Ordner entpacken.
2. `Start.cmd` doppelklicken. Die Oberfläche öffnet sich im Browser.
3. Videos auswählen und **Tags vorschlagen** anklicken.
4. Vorschläge prüfen, falsche Tags abwählen und fehlende Tags ergänzen.
5. **JSON herunterladen** anklicken.

Der Export wird als `cake-tags.json` über den Browser heruntergeladen. Es gibt keine automatische Speicherung von Ergebnissen. Vor dem Neuladen oder Schließen der Seite die gewünschte Auswahl herunterladen. **Programm beenden** schließt den lokalen Dienst.

Bei einer Kopie aus Git fehlen drei große Abhängigkeiten. Einmalig `Setup.cmd` ausführen, um die festgelegten Dateien herunterzuladen und ihre Prüfsummen zu kontrollieren. Danach funktioniert die Anwendung offline. Bereits mitgelieferte Dateien werden geprüft und nicht erneut heruntergeladen.

## Einstellungen

**Einstellungen** ist auf der Hauptseite und in der eingebetteten Analyse verfügbar. Ein Klick auf das Firefox-Erweiterungssymbol öffnet direkt die separate Analyseansicht.

- Sprache: Browsersprache, Deutsch oder Englisch. Tagnamen bleiben unverändert.
- Bildanzahl: automatisch nach Videolänge oder 4 bis 48 Bilder.
- Scores und unsichere Vorschläge ein- oder ausblenden.
- Tags von neuen automatischen Vorschlägen ausschließen. `hairy` und `watermark` sind standardmäßig ausgeschlossen; diese Ausschlüsse lassen sich entfernen.

**Speichern** übernimmt die Werte, **Standardwerte** setzt die Formularauswahl zurück. Bestehende Tag-Auswahlen und manuelle Ergänzungen bleiben erhalten. Einstellungen bleiben nach dem Neuladen gespeichert; Ergebnisse bleiben weiterhin nur in der Sitzung. Die Firefox-Ansichten teilen die Einstellungen über den Erweiterungsspeicher. Die eigenständige Oberfläche nutzt ihren Browser-Speicher und verwaltet eine separate Auswahl.

## Funktionen

- Vergrößerbare Vorschaubilder mit Bildnavigation per Schaltfläche oder Pfeiltaste. Schließen über Escape, Schließen-Schaltfläche oder Klick außerhalb.
- Automatische Bildanzahl nach Videolänge, gleichmäßig über den Clip verteilt. Eine feste Anzahl von 4 bis 48 Bildern bleibt auswählbar.
- Feste Erkennungsschwelle von 0,4 und ausgewogene Tag-Auswahl. Unsichere Kandidaten bleiben als zunächst nicht ausgewählte Tags sichtbar.
- Manuelle Tag-Auswahl. Tags zeigen ihre Herkunft als **Vorschlag** oder **Ergänzt**; Ergänzungen sind zusätzlich farblich markiert. Modellvorschläge zeigen ihren Score als Prozentwert; dieser ist keine kalibrierte Wahrscheinlichkeit für einen richtigen Tag.
- Sitzungsbasierte Bearbeitung ohne dauerhafte Ergebnisablage.
- Zuordnung anhand des Datei-Inhalts innerhalb derselben Sitzung.
- JSON-Export mit Auswahl, ursprünglichen Vorschlägen, Scores sowie ergänzten und entfernten Tags.

Die Oberfläche ist auch eigenständig nutzbar: Videos auswählen, Tags prüfen und JSON herunterladen. Beim Neuladen beginnt eine neue Sitzung.

Die automatische Auswahl verwendet 8 Bilder bis 15 Sekunden, 12 bis 30 Sekunden, 16 bis einer Minute, 24 bis zwei Minuten, 32 bis fünf Minuten und 48 bis zehn Minuten. Längere Videos benötigen dadurch mehr Rechenzeit, bleiben aber auf maximal 48 Bilder begrenzt.

## Daten und Datenschutz

Die Analyse erfolgt im Browser. Der lokale Dienst hört ausschließlich auf `127.0.0.1:8765`. Im normalen Betrieb erfolgen keine Internetabfragen. Videos und Vorschaubilder werden nicht dauerhaft im Projekt gespeichert.

Ergebnisse, Korrekturen und Analyse-Cache bleiben im Arbeitsspeicher der Seite. Alte Korrekturdateien werden nicht mehr geladen; der frühere IndexedDB-Ergebniscache wird beim Start entfernt. Der Dienst hält Download-Snapshots höchstens fünf Minuten im Arbeitsspeicher. Exportdateien enthalten Dateinamen und Tags und sollten bewusst weitergegeben werden.

## Grenzen

- Maximal zehn Minuten und 250 MiB pro Video. MP4/M4V mit H.264 sind geeignete Formate; weitere Formate hängen von der Unterstützung des Browsers ab.
- Einzelbilder können kurze Ereignisse übersehen. **Ausgewogen** benötigt für die meisten Tags Treffer in mehr als der Hälfte der Bilder. Ausgewählte Kleidungs-, Accessoire- und Objekttags benötigen mindestens ein Viertel der Bilder (mindestens zwei), dafür aber einen Score von mindestens 0,65. Diese Regeln sind Heuristiken; ihre Wirkung auf die Erkennungsqualität muss mit neuen geprüften Videos bewertet werden.
- `dance` benötigt mindestens einen Score von 0,65. Die Bildabdeckung ist eine Stichprobe und keine genaue Messung der Videodauer. Mehr Bilder ersetzen keine Bewegungsanalyse. Nicht vorgeschlagene Tags bleiben manuell ergänzbar.
- `hairy` und `watermark` sind wegen häufiger Fehlzuordnungen standardmäßig von automatischen Vorschlägen ausgeschlossen. Die Ausschlüsse sind im Einstellungsmenü änderbar. Vorhandene Auswahlen und Prüfmarkierungen werden durch neue Regeln nicht geändert.
- JoyTag wurde überwiegend mit Zeichnungen und zusätzlich mit Fotos trainiert. Bei realen Videos sind Fehlzuordnungen möglich. Scores sind keine kalibrierten Wahrscheinlichkeiten.
- 159 von 258 Tags haben eine automatische Modellzuordnung. Die übrigen Tags stehen in der [Abdeckungsübersicht](docs/TAG_COVERAGE.md). Kontext- und Identitätsangaben sowie technische Tags der Upload-Seite werden nicht automatisch abgeleitet.
- Manuelle Korrekturen ändern die Auswahl dieser Sitzung; sie trainieren das Modell nicht.

## Entwicklung und Weitergabe

`scripts/Test.ps1` prüft Syntax, Ergebnisvalidierung und den Download-Export anhand künstlicher Testdaten.

`scripts/Package.ps1` erzeugt `outputs/Cake-Tagger.zip` aus versionierten Projektdateien und den geprüften Abhängigkeiten. Persönliche Daten, Videos, Testberichte und die Git-Historie werden nicht aufgenommen. Zum Teilen dieses Paket verwenden, statt den gesamten Arbeitsordner zu kopieren.

Der Quellcode liegt im Projektstamm. `docs/` enthält technische Dokumentation, `scripts/` wiederverwendbare Werkzeuge und `tests/` automatisierte Tests. `data/`, `outputs/` und `work/` sind lokale, nicht versionierte Ordner. Große Modelldateien und Laufzeit-Binärdateien bleiben ebenfalls außerhalb von Git.

Weitere Informationen: [Browser-Integration](docs/INTEGRATION.md), [Technik](docs/TECHNICAL.md), [Prüfung](docs/TESTING.md), [Drittanbieter](THIRD_PARTY.md).
