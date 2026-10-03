# Technischer Aufbau

## Verarbeitung

`app.js` liest lokale Dateien, berechnet deren SHA-256-Prüfsumme und entnimmt Bilder über Video- und Canvas-APIs. Die 448 × 448 Pixel großen Modellbilder werden direkt als RGBA-Puffer an den Worker übertragen. JPEG-Vorschaubilder dienen ausschließlich der Anzeige; sie werden für die Erkennung nicht erneut dekodiert. `engine-worker.js` führt JoyTag INT8 mit ONNX Runtime Web in einem Worker aus. Die Verarbeitung erfolgt nacheinander und verwendet bis zu vier CPU-Threads.

Eingabe: 448 × 448 Pixel, RGB, quadratisch mit weißem Rand aufgefüllt und mit CLIP-Farbwerten normalisiert. Ausgabe: 5.813 Logits, aus denen Sigmoid-Scores berechnet werden. Die Browser-Skalierung ist nicht identisch mit Pillow-Bicubic.

`sampling.mjs` plant die Bildanzahl nach der dekodierten Videolänge: bis 15/30/60/120/300/600 Sekunden werden 8/12/16/24/32/48 Bilder entnommen. Eine feste Anzahl bleibt möglich. Videos über 600 Sekunden werden vor der Bilderkennung zurückgewiesen. Die Entnahmepunkte liegen gleichmäßig im Inneren des Clips; Anfang und Ende werden nicht direkt getroffen.

`tagging.mjs` ordnet Modellausgaben über `mapping.json` der Tagliste zu. Im ausgewogenen Modus benötigen die meisten Tags Treffer in mehr als der Hälfte aller Bilder. Eine ausdrücklich aufgeführte Gruppe von Kleidungs-, Accessoire- und Objekttags benötigt mindestens ein Viertel der Bilder, mindestens zwei, bei einem Score von mindestens 0,65. Damit können klare, vorübergehend sichtbare Details relevant bleiben, ohne einen einzelnen Treffer auszuwählen. Die Oberfläche verwendet fest die Schwelle 0,4 und den ausgewogenen Modus. Ältere gespeicherte Ergebnisse aus dem Modus für kurze Szenen bleiben lesbar. Diese Regeln sind nicht statistisch kalibriert.

Weniger häufige oder schwächere Treffer erscheinen als unsicher. `hairy` und `watermark` werden in beiden Modi weder automatisch noch als unsichere Treffer vorgeschlagen; die manuelle Auswahl bleibt möglich. Die aktuelle automatische Zuordnungsabdeckung steht in `model/coverage.json`; sie ist keine Genauigkeitsmessung. `piercings` berücksichtigt zusätzlich spezifische Modell-Tags für Nasen-, Lippen-, Zungen-, Nabel- und Brustwarzenpiercings. Ohrpiercing wird nicht zusätzlich als Synonym aufgenommen. `tag-policy.mjs` setzt die ausgeschlossenen Kategorien bei jeder Analyse durch. `docs/TAG_COVERAGE.md` listet die verbleibenden manuellen Tags; `scripts/Update-Coverage.mjs` aktualisiert diese Übersicht und die Abdeckungsdatei. `dance` benötigt in beiden Modi mindestens einen Score von 0,65. Die Zuordnung verwendet das Einzelbild-Label `dancing`; sie bestätigt keinen Bewegungsablauf.

## Speicherung

`corrections.mjs` validiert Korrekturen, stellt sie wieder her und erzeugt die Exportfelder. `static.mjs` stellt die Oberfläche bereit und speichert Daten über authentifizierte lokale Endpunkte. Der Start-Token wird im URL-Fragment übergeben. Zugriffe auf Daten benötigen diesen Token; Host und Origin werden geprüft.

- `data/corrections.json`: Auswahl, Kandidaten, Prüfstatus und zugehörige Ausgangsanalyse, nach Datei-Prüfsumme gespeichert.
- `data/corrections.json.bak`: vorheriger Stand.
- `data/session.json`: lokaler Start-Token und Prozesskennung. Nicht weitergeben.
- `outputs/cake-tags.json`: Export, Version 2. Enthält Dateinamen, Prüfsummen, ausgewählte Tags, Prüfstatus, ursprüngliche Vorschläge und Scores, ergänzte/entfernte Tags, Schwelle und Zeitangaben.
- IndexedDB `cake-tagger-browser-v1`: ursprüngliche Modellresultate. Der Cache-Schlüssel berücksichtigt Dateiinhalt, tatsächliche Bildanzahl, Schwelle, Modell, Zuordnung, Vorverarbeitung und Analyse-Regel. Neue Resultate und Exporte enthalten `analysisPolicy` (`coverage-v4:majority`; historische Datensätze können auch `brief` enthalten), `durationSeconds` und `samplingMode` (`auto` oder `fixed`). Gespeicherte v3-, v2- und ältere Ergebnisse bleiben lesbar; ihr Cache wird nicht als neue Analyse ausgegeben.

Alte Ergebnisse ohne Ausgangsanalyse kennzeichnen ursprüngliche Vorschläge und daraus abgeleitete Änderungen als unbekannt. Ein noch vorhandener passender Browser-Cache kann diese Angaben wiederherstellen. Scores werden nicht ergänzt oder erfunden.

`tagSources` dokumentiert je Kandidat `suggestion`, `manual` oder `unknown`. Diese Herkunft bleibt bei späteren Analysen erhalten; sie wird nicht aus einem geänderten Vorschlagssatz neu abgeleitet. Ältere Ergebnisse werden anhand ihrer bekannten Ausgangsvorschläge eingeordnet. Bei unbekannten Ausgangsvorschlägen zeigt die Oberfläche „Unbekannt“.

Änderungen werden seriell gespeichert. Bei einem Fehler bleibt die Auswahl sichtbar; die Oberfläche meldet den Fehler und erlaubt einen separaten Export. Mehrere Fenster mit derselben Datei können einander überschreiben; es gibt noch keine Konfliktauflösung.

Nach einem authentifizierten Export erstellt der Server einen zufälligen Download-Link mit fünf Minuten Gültigkeit. Der Link liefert genau den erzeugten JSON-Snapshot als Anhang, unabhängig von späteren Exporten. Höchstens drei Snapshots bleiben im Arbeitsspeicher; sie werden nicht öffentlich aufgelistet. Der Download-Link selbst gewährt Zugriff auf diesen Snapshot und sollte wie die Exportdatei behandelt werden.

## Abhängigkeiten

Modellquelle, Revision und Laufzeitversion stehen in `model/provenance.json`. `scripts/assets.json` enthält Download-Adressen und SHA-256-Werte der drei großen, nicht versionierten Dateien. `Setup.cmd` stellt diese bei Bedarf wieder her. Der Download ersetzt eine vorhandene Datei erst nach erfolgreicher Prüfsummenprüfung.

Die Anwendung hat keine npm-Installation und keinen Build-Schritt. Node.js dient als lokaler Dateiserver. Browser-Laufzeit und Lizenztexte liegen unter `vendor/`, Modellinformationen unter `model/` und Node.js unter `runtime/`.

## Offene Funktionen

Automatisches Eintragen in cake.ski, eine Userscript-Anbindung und der Abruf von Redgifs-Metadaten sind nicht implementiert. Eine systematisch bewertete Testmenge für die Erkennungsqualität fehlt ebenfalls.

## Laufzeitmessung

Neue Analysen speichern `timings`: Bildentnahme und Aufbereitung (`samplingSeconds`), Modellinitialisierung (`modelLoadSeconds`), Normalisierung im Worker (`preprocessSeconds`), Modellberechnung (`inferenceSeconds`) und Gesamtzeit bis zur Aggregation (`totalSeconds`). Gesamtzeit enthält zusätzliche Übergabe- und Verwaltungsarbeit; die Teilzeiten müssen sich nicht exakt dazu addieren. Export und dauerhafte Speicherung sind nicht enthalten. Bei einem Cache-Treffer stammen die Analysezeiten aus der ursprünglichen Berechnung. Ältere Datensätze enthalten keine Messung.

Die neue verlustfreie Bildübergabe verwendet `preprocess-v2` im Cache-Schlüssel. Wegen des entfallenen JPEG-Schritts können Scores gegenüber früheren Analysen leicht abweichen. Auswahlen und Prüfmarkierungen bleiben bei einer erneuten Analyse erhalten.

## GPU-Unterstützung

Die Anwendung verwendet weiterhin den WASM-Provider auf der CPU. Das INT8-Modell enthält `DynamicQuantizeLinear`, `ConvInteger` und `MatMulInteger`; diese Operationen fehlen in der WebGPU-Operatorliste der verwendeten Laufzeit. Ein WebGPU-Start kann dennoch über die interne CPU-Ausführung einzelner Operationen gelingen. Gemischte Ausführung und Datenübertragungen können den Gewinn aufheben. Ein GPU-Provider sollte erst nach einem Modellkompatibilitäts-, Geschwindigkeits- und Ergebnisvergleich aktiviert werden. Eine andere Modellpräzision wäre eine gesonderte Änderung mit zusätzlichen Download- und Speicheranforderungen.

Referenzen: [WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html), [Operatorunterstützung](https://github.com/microsoft/onnxruntime/blob/main/js/web/docs/webgpu-operators.md).
