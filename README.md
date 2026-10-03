# Cake Tagger

Lokale Tag-Vorschläge für Videos, abgestimmt auf die mitgelieferte Tagliste von cake.ski. Die Anwendung analysiert einzelne Videobilder, lässt Vorschläge bearbeiten und speichert die Ergebnisse als JSON.

Das Projekt befindet sich in Entwicklung. Die Erkennungsqualität ist noch nicht systematisch gemessen. Eine automatische Übertragung auf cake.ski ist derzeit nicht enthalten.

## Start

Voraussetzungen: Windows 64 Bit und ein aktueller Chrome- oder Edge-Browser mit WebAssembly und OffscreenCanvas. Die Analyse läuft auf der CPU.

1. Das vollständige Anwendungspaket in einen beschreibbaren Ordner entpacken.
2. `Start.cmd` doppelklicken. Die Oberfläche öffnet sich im Browser.
3. Videos auswählen und **Tags vorschlagen** anklicken.
4. Vorschläge prüfen, falsche Tags abwählen und fehlende Tags ergänzen.
5. **Vorschläge geprüft** markieren und **JSON im Projektordner speichern** anklicken.

Der Export liegt unter `outputs/cake-tags.json`; es öffnet sich kein Speicherdialog. Nach dem Speichern erscheint zusätzlich **JSON herunterladen** für einen Browser-Download. Der Link ist fünf Minuten gültig; danach erneut speichern. Beim nächsten Export bleibt die vorherige Datei als `.bak` erhalten. **Programm beenden** schließt den lokalen Dienst; der Browser-Tab kann anschließend geschlossen werden.

Bei einer Kopie aus Git fehlen drei große Abhängigkeiten. Einmalig `Setup.cmd` ausführen, um die festgelegten Dateien herunterzuladen und ihre Prüfsummen zu kontrollieren. Danach funktioniert die Anwendung offline. Bereits mitgelieferte Dateien werden geprüft und nicht erneut heruntergeladen.

## Funktionen

- Automatische Bildanzahl nach Videolänge, gleichmäßig über den Clip verteilt. Eine feste Anzahl von 4 bis 48 Bildern bleibt auswählbar.
- Einstellbare Erkennungsschwelle und zeitliche Abdeckung; Hinweise auf kurze oder unsichere Treffer.
- Manuelle Tag-Auswahl und getrennte Prüfmarkierung. Tags zeigen ihre Herkunft als **Vorschlag** oder **Ergänzt**; Ergänzungen sind zusätzlich farblich markiert.
- Automatische Speicherung der Korrekturen, auch über Programmneustarts hinweg.
- Zuordnung anhand des Datei-Inhalts: Umbenennen eines Videos verliert dessen Korrekturen nicht.
- JSON-Export mit Auswahl, Prüfstatus, ursprünglichen Vorschlägen, Scores sowie ergänzten und entfernten Tags.

Gespeicherte Ergebnisse erscheinen beim Start automatisch. Für Vorschaubilder die Videos erneut auswählen und analysieren. Die bearbeitete Auswahl bleibt erhalten.

Die automatische Auswahl verwendet 8 Bilder bis 15 Sekunden, 12 bis 30 Sekunden, 16 bis einer Minute, 24 bis zwei Minuten, 32 bis fünf Minuten und 48 bis zehn Minuten. Längere Videos benötigen dadurch mehr Rechenzeit, bleiben aber auf maximal 48 Bilder begrenzt.

## Daten und Datenschutz

Die Analyse erfolgt im Browser. Der lokale Dienst hört ausschließlich auf `127.0.0.1:8765`. Im normalen Betrieb erfolgen keine Internetabfragen. Videos und Vorschaubilder werden nicht dauerhaft im Projekt gespeichert.

Korrekturen liegen unter `data/corrections.json`; ursprüngliche Analyseergebnisse werden zusätzlich im Browser zwischengespeichert. Browserdaten zu löschen entfernt diesen Cache, aber nicht die Korrekturdatei. Exportdateien enthalten Dateinamen und Tags und sollten bewusst weitergegeben werden.

## Grenzen

- Maximal zehn Minuten und 250 MiB pro Video. MP4/M4V mit H.264 sind geeignete Formate; weitere Formate hängen von der Unterstützung des Browsers ab.
- Einzelbilder können kurze Ereignisse übersehen. **Ausgewogen** benötigt für die meisten Tags Treffer in mehr als der Hälfte der Bilder. Ausgewählte Kleidungs-, Accessoire- und Objekttags benötigen mindestens ein Viertel der Bilder (mindestens zwei), dafür aber einen Score von mindestens 0,65 oder die höhere gewählte Schwelle. **Auch kurze Szenen** verwendet für alle automatischen Tags mindestens zwei Bilder an der gewählten Schwelle. Diese Regeln sind Heuristiken; ihre Wirkung auf die Erkennungsqualität muss mit neuen geprüften Videos bewertet werden.
- Die Bildabdeckung ist eine Stichprobe und keine genaue Messung der Videodauer. Mehr Bilder ersetzen keine Bewegungsanalyse. Nicht vorgeschlagene Tags bleiben manuell ergänzbar.
- `hairy` wird wegen häufiger Fehlzuordnungen nur manuell ergänzt. Vorhandene Auswahlen und Prüfmarkierungen werden durch neue Regeln nicht geändert.
- JoyTag wurde überwiegend mit Zeichnungen und zusätzlich mit Fotos trainiert. Bei realen Videos sind Fehlzuordnungen möglich. Scores sind keine kalibrierten Wahrscheinlichkeiten.
- Nicht alle Tags haben eine Modellzuordnung. Kontext- und Identitätsangaben sowie technische Tags der Upload-Seite werden nicht automatisch abgeleitet.
- Manuelle Korrekturen ändern die gespeicherte Auswahl; sie trainieren das Modell nicht.

## Entwicklung und Weitergabe

`scripts/Test.ps1` prüft Syntax und die Speicherung sowie den Export anhand künstlicher Testdaten.

`scripts/Package.ps1` erzeugt `outputs/Cake-Tagger.zip` aus versionierten Projektdateien und den geprüften Abhängigkeiten. Persönliche Daten, Videos, Testberichte und die Git-Historie werden nicht aufgenommen. Zum Teilen dieses Paket verwenden, statt den gesamten Arbeitsordner zu kopieren.

Der Quellcode liegt im Projektstamm. `docs/` enthält technische Dokumentation, `scripts/` wiederverwendbare Werkzeuge und `tests/` automatisierte Tests. `data/`, `outputs/` und `work/` sind lokale, nicht versionierte Ordner. Große Modelldateien und Laufzeit-Binärdateien bleiben ebenfalls außerhalb von Git.

Weitere Informationen: [Technik](docs/TECHNICAL.md), [Prüfung](docs/TESTING.md), [Drittanbieter](THIRD_PARTY.md).
