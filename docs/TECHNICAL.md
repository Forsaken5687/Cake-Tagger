# Technischer Aufbau

## Verarbeitung

`app.js` liest lokale Dateien, berechnet deren SHA-256-Prüfsumme und entnimmt Bilder über Video- und Canvas-APIs. `engine-worker.js` führt JoyTag INT8 mit ONNX Runtime Web in einem Worker aus. Die Verarbeitung erfolgt nacheinander und verwendet bis zu vier CPU-Threads.

Eingabe: 448 × 448 Pixel, RGB, quadratisch mit weißem Rand aufgefüllt und mit CLIP-Farbwerten normalisiert. Ausgabe: 5.813 Logits, aus denen Sigmoid-Scores berechnet werden. Die Browser-Skalierung ist nicht identisch mit Pillow-Bicubic.

`tagging.mjs` ordnet Modellausgaben über `mapping.json` der Tagliste zu. Ein Tag muss in mindestens zwei Bildern die gewählte Schwelle erreichen. Erkennung in nur einem Bild erscheint als unsicher. Die aktuelle Abdeckung steht in `model/coverage.json`; sie ist keine Genauigkeitsmessung. `tag-policy.mjs` dokumentiert die bei der Erstellung der Zuordnung ausgeschlossenen Kategorien.

## Speicherung

`corrections.mjs` validiert Korrekturen, stellt sie wieder her und erzeugt die Exportfelder. `static.mjs` stellt die Oberfläche bereit und speichert Daten über authentifizierte lokale Endpunkte. Der Start-Token wird im URL-Fragment übergeben. Zugriffe auf Daten benötigen diesen Token; Host und Origin werden geprüft.

- `data/corrections.json`: Auswahl, Kandidaten, Prüfstatus und zugehörige Ausgangsanalyse, nach Datei-Prüfsumme gespeichert.
- `data/corrections.json.bak`: vorheriger Stand.
- `data/session.json`: lokaler Start-Token und Prozesskennung. Nicht weitergeben.
- `outputs/cake-tags.json`: Export, Version 2. Enthält Dateinamen, Prüfsummen, ausgewählte Tags, Prüfstatus, ursprüngliche Vorschläge und Scores, ergänzte/entfernte Tags, Schwelle und Zeitangaben.
- IndexedDB `cake-tagger-browser-v1`: ursprüngliche Modellresultate. Der Cache-Schlüssel berücksichtigt Dateiinhalt, Bildanzahl, Schwelle, Modell, Zuordnung und Vorverarbeitung.

Alte Ergebnisse ohne Ausgangsanalyse kennzeichnen ursprüngliche Vorschläge und daraus abgeleitete Änderungen als unbekannt. Ein noch vorhandener passender Browser-Cache kann diese Angaben wiederherstellen. Scores werden nicht ergänzt oder erfunden.

Änderungen werden seriell gespeichert. Bei einem Fehler bleibt die Auswahl sichtbar; die Oberfläche meldet den Fehler und erlaubt einen separaten Export. Mehrere Fenster mit derselben Datei können einander überschreiben; es gibt noch keine Konfliktauflösung.

## Abhängigkeiten

Modellquelle, Revision und Laufzeitversion stehen in `model/provenance.json`. `scripts/assets.json` enthält Download-Adressen und SHA-256-Werte der drei großen, nicht versionierten Dateien. `Setup.cmd` stellt diese bei Bedarf wieder her. Der Download ersetzt eine vorhandene Datei erst nach erfolgreicher Prüfsummenprüfung.

Die Anwendung hat keine npm-Installation und keinen Build-Schritt. Node.js dient als lokaler Dateiserver. Browser-Laufzeit und Lizenztexte liegen unter `vendor/`, Modellinformationen unter `model/` und Node.js unter `runtime/`.

## Offene Funktionen

Automatisches Eintragen in cake.ski, eine Userscript-Anbindung und der Abruf von Redgifs-Metadaten sind nicht implementiert. Eine systematisch bewertete Testmenge für die Erkennungsqualität fehlt ebenfalls.
