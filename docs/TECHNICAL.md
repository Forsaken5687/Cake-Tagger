# Technischer Aufbau

## Verarbeitung

`app.js` liest lokale Dateien, berechnet deren SHA-256-Prüfsumme und entnimmt Bilder über Video- und Canvas-APIs. Die 448 × 448 Pixel großen Modellbilder werden direkt als RGBA-Puffer an den Worker übertragen. JPEG-Vorschaubilder dienen ausschließlich der Anzeige; sie werden für die Erkennung nicht erneut dekodiert. `engine-worker.js` führt JoyTag INT8 mit ONNX Runtime Web in einem Worker aus. Die Verarbeitung erfolgt nacheinander und verwendet bis zu vier CPU-Threads.

Eingabe: 448 × 448 Pixel, RGB, quadratisch mit weißem Rand aufgefüllt und mit CLIP-Farbwerten normalisiert. Ausgabe: 5.813 Logits, aus denen Sigmoid-Scores berechnet werden. Die Browser-Skalierung ist nicht identisch mit Pillow-Bicubic.

`sampling.mjs` plant die Bildanzahl nach der dekodierten Videolänge: bis 15/30/60/120/300/600 Sekunden werden 8/12/16/24/32/48 Bilder entnommen. Eine feste Anzahl bleibt möglich. Videos über 600 Sekunden werden vor der Bilderkennung zurückgewiesen. Die Entnahmepunkte liegen gleichmäßig im Inneren des Clips; Anfang und Ende werden nicht direkt getroffen.

`tagging.mjs` ordnet Modellausgaben über `mapping.json` der Tagliste zu. Im ausgewogenen Modus benötigen die meisten Tags Treffer in mehr als der Hälfte aller Bilder. Eine ausdrücklich aufgeführte Gruppe von Kleidungs-, Accessoire- und Objekttags benötigt mindestens ein Viertel der Bilder, mindestens zwei, bei einem Score von mindestens 0,65. Damit können klare, vorübergehend sichtbare Details relevant bleiben, ohne einen einzelnen Treffer auszuwählen. Die Oberfläche verwendet fest die Schwelle 0,4 und den ausgewogenen Modus. Ältere gespeicherte Ergebnisse aus dem Modus für kurze Szenen bleiben lesbar. Diese Regeln sind nicht statistisch kalibriert.

Weniger häufige oder schwächere Treffer bleiben im Ergebnis als `uncertain` gespeichert, erscheinen als zunächst nicht ausgewählte Tag-Chips mit der Kennzeichnung „Unsicher“. `hairy` und `watermark` werden standardmäßig weder automatisch noch als unsichere Treffer vorgeschlagen. Diese beiden Ausschlüsse und weitere benutzerdefinierte Ausschlüsse sind über die Einstellungen änderbar; andere manuelle Kategorien bleiben fest ausgeschlossen. Die aktuelle automatische Zuordnungsabdeckung steht in `model/coverage.json`; sie ist keine Genauigkeitsmessung. `piercings` berücksichtigt zusätzlich spezifische Modell-Tags für Nasen-, Lippen-, Zungen-, Nabel- und Brustwarzenpiercings. Ohrpiercing wird nicht zusätzlich als Synonym aufgenommen. `tag-policy.mjs` setzt die ausgeschlossenen Kategorien bei jeder Analyse durch. `docs/TAG_COVERAGE.md` listet die verbleibenden manuellen Tags; `scripts/Update-Coverage.mjs` aktualisiert diese Übersicht und die Abdeckungsdatei. `dance` benötigt in beiden Modi mindestens einen Score von 0,65. Die Zuordnung verwendet das Einzelbild-Label `dancing`; sie bestätigt keinen Bewegungsablauf.

## Sitzung und Download

Ergebnisse, Tag-Auswahlen und der Ergebnis-Cache befinden sich ausschließlich im Arbeitsspeicher von `app.js`. Identische Dateiinhalte werden innerhalb derselben Sitzung anhand ihrer SHA-256-Prüfsumme zugeordnet. Neue Seitenaufrufe beginnen ohne Ergebnisse. Der frühere IndexedDB-Ergebniscache wird entfernt; alte Korrekturdateien werden nicht geladen oder weitergeschrieben.

`corrections.mjs` validiert Ergebnisobjekte und erzeugt die Exportfelder. `static.mjs` nimmt diese über einen authentifizierten lokalen Endpunkt an und erzeugt einen JSON-Snapshot im Arbeitsspeicher. Ein zufälliger Download-Link liefert ihn als Browser-Anhang. Höchstens drei Snapshots bleiben für jeweils fünf Minuten verfügbar. Der Export schreibt keine Ergebnisdatei in den Projektordner. Der Download-Link gewährt Zugriff auf den Snapshot und sollte wie die JSON-Datei behandelt werden.

`data/session.json` enthält nur den Start-Token und die Prozesskennung des lokalen Diensts; nicht weitergeben. Der Token wird beim Start im URL-Fragment übergeben. Host und Origin werden geprüft; das Erstellen von Download-Snapshots benötigt den Token. Der alte Endpunkt `/api/corrections` ist entfernt.

Der Export in Version 2 enthält Dateinamen, Prüfsummen, ausgewählte Tags, Prüfstatus, Ausgangsvorschläge, ergänzte und entfernte Tags, `tagSources`, unsichere Kandidaten mit `uncertainScores`, Bildanzahl, Analyseregel, Modell und Laufzeitmessungen. Manuelle Ergänzungen erhalten keine erfundenen Modell-Scores. `tagSources` bleibt bei erneuter Analyse derselben Datei innerhalb der Sitzung erhalten. Der Ergebnis-Cache berücksichtigt Modell, Zuordnung, Bildanzahl und `preprocess-v2`.

## Abhängigkeiten

Modellquelle, Revision und Laufzeitversion stehen in `model/provenance.json`. `scripts/assets.json` enthält Download-Adressen und SHA-256-Werte der drei großen, nicht versionierten Dateien. `Setup.cmd` stellt diese bei Bedarf wieder her. Der Download ersetzt eine vorhandene Datei erst nach erfolgreicher Prüfsummenprüfung.

Die Anwendung hat keine npm-Installation und keinen Build-Schritt. Node.js dient als lokaler Dateiserver. Browser-Laufzeit und Lizenztexte liegen unter `vendor/`, Modellinformationen unter `model/` und Node.js unter `runtime/`.

## Offene Funktionen

Automatisches Eintragen in cake.ski, eine Userscript-Anbindung und der Abruf von Redgifs-Metadaten sind nicht implementiert. Eine systematisch bewertete Testmenge für die Erkennungsqualität fehlt ebenfalls.

## Laufzeitmessung

Neue Analysen enthalten `timings`: Bildentnahme und Aufbereitung (`samplingSeconds`), Modellinitialisierung (`modelLoadSeconds`), Normalisierung im Worker (`preprocessSeconds`), Modellberechnung (`inferenceSeconds`) und Gesamtzeit bis zur Aggregation (`totalSeconds`). Gesamtzeit enthält zusätzliche Übergabe- und Verwaltungsarbeit; die Teilzeiten müssen sich nicht exakt dazu addieren. Export und dauerhafte Speicherung sind nicht enthalten. Bei einem Cache-Treffer stammen die Analysezeiten aus der ursprünglichen Berechnung. Ältere Datensätze enthalten keine Messung.

Die neue verlustfreie Bildübergabe verwendet `preprocess-v2` im Cache-Schlüssel. Wegen des entfallenen JPEG-Schritts können Scores gegenüber früheren Analysen leicht abweichen. Auswahlen und Prüfmarkierungen bleiben bei einer erneuten Analyse innerhalb derselben Sitzung erhalten.

## GPU-Unterstützung

Die Anwendung verwendet weiterhin den WASM-Provider auf der CPU. Das INT8-Modell enthält `DynamicQuantizeLinear`, `ConvInteger` und `MatMulInteger`; diese Operationen fehlen in der WebGPU-Operatorliste der verwendeten Laufzeit. Ein WebGPU-Start kann dennoch über die interne CPU-Ausführung einzelner Operationen gelingen. Gemischte Ausführung und Datenübertragungen können den Gewinn aufheben. Ein GPU-Provider sollte erst nach einem Modellkompatibilitäts-, Geschwindigkeits- und Ergebnisvergleich aktiviert werden. Eine andere Modellpräzision wäre eine gesonderte Änderung mit zusätzlichen Download- und Speicheranforderungen.

Referenzen: [WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html), [Operatorunterstützung](https://github.com/microsoft/onnxruntime/blob/main/js/web/docs/webgpu-operators.md).

## Anzeige der Modell-Scores

Vorgeschlagene Tags mit bekannter Ausgangsanalyse zeigen ihren gespeicherten `confidence`-Wert als gerundeten Prozentwert unter der Bezeichnung „Score“. Er ist der Durchschnitt der zwei stärksten Bildtreffer und beschreibt weder den Anteil passender Videobilder noch eine kalibrierte Wahrscheinlichkeit für die Richtigkeit des Tags. Die zeitliche Abdeckung wird weiterhin separat über `supportingFrames` geprüft. Manuelle Ergänzungen, unbekannte Ausgangsvorschläge und Vorschläge ohne gespeicherten Score erhalten keinen erfundenen Prozentwert. Die Darstellung ändert keine gespeicherten Werte oder Auswahlregeln.

Neue Analysen speichern zusätzlich `uncertainScores` mit dem Modellscore (Durchschnitt der zwei stärksten Bildtreffer) und der Anzahl unterstützender Bilder je unsicherem Kandidaten. Diese Angaben bleiben während der Sitzung und im Download erhalten. Ältere Datensätze können hier nur Tagnamen enthalten; die Oberfläche zeigt für sie keinen erfundenen Score. Die neue Cache-Regel v5 fordert für neue Analysen echte Scores an; bestehende Auswahlen bleiben erhalten. Unsichere Kandidaten werden nicht automatisch in die ausgewählten Export-Tags aufgenommen.

## Vorschauansicht

Vorschaubilder sind als zugängliche Schaltflächen umgesetzt. Ein natives modales `dialog` zeigt das gewählte Bild vergrößert, hält den Tastaturfokus in der Ansicht und ermöglicht die Navigation mit Pfeiltasten oder Schaltflächen. Escape, die Schließen-Schaltfläche und ein Klick auf den Hintergrund schließen die Ansicht. Beim Schließen wird die Bildreferenz freigegeben. Die Ansicht verwendet die vorhandene Vorschau mit maximal 640 Pixeln Kantenlänge; sie ist keine zusätzliche Extraktion in Originalauflösung. Der Prüfstatus bleibt aus Kompatibilitätsgründen im Exportformat, hat aber keine Bedienelemente mehr in der Oberfläche.

## Logo

Das eigenständige SVG-Zeichen liegt unter `assets/logo.svg`. Die Oberfläche bettet es direkt im Seitenkopf ein; das SVG-Favicon verweist auf dieselbe Asset-Datei. Es benötigt keine externen Schriftarten oder Bilddienste.
## Firefox-Integration

Die eingebettete Ansicht verwendet neutrale dunkle Flächen und den cake.ski-Akzent `#fe2c55`. Hauptseite, separate Analyseansicht, Einstellungen und eingebettete Ansicht verwenden gemeinsam dieses Farbschema. Primäre Schaltflächen haben weiße Schrift auf Pink, sekundäre Schaltflächen neutrale Grautöne; Fokus- und Auswahlzustände verwenden denselben Akzent.

`embedded-upload.mjs` fügt eine Analyseansicht vor der Upload-Mount ein und beobachtet Single-/Bulk-Wechsel. Die Ansicht liegt als eingebettetes Erweiterungsdokument auf dem Erweiterungsursprung. Vertrauenswürdige Datei- und Drop-Ereignisse liefern lokale File-Objekte; nur Dateien mit sichtbaren Upload-Zielen werden per strukturiertem Klonen an das eingebettete Dokument übergeben. Der Empfang prüft Elternfenster, cake.ski-Ursprung, Nachrichtentyp, Sitzungskanal und File-Typ. Die ursprünglichen Datei-Ereignisse werden nicht unterbrochen. Es werden weder zusätzliche Uploads noch zusätzliche Dateiauswahldialoge ausgelöst.

Die Einbettung bleibt außerhalb der wechselnden Single-/Bulk-Renderer erhalten. Schließen blendet das Dokument nur aus. Unveränderte Dateien behalten beim Aktualisieren der Auswahl ihre Analyse und Korrekturen anhand des Inhalts-Hashes. Änderungen während einer Analyse werden vorgemerkt und danach übernommen. File-Referenzen sind der jeweiligen Upload-Mount zugeordnet; gleichnamige Upload-Karten bleiben eine unklare Zuordnung und werden bei der Tag-Übernahme abgewiesen.

Die Erweiterung verwendet die gemeinsame Oberfläche, Engine und Tag-Regeln. `app.js` lädt die Erweiterungsanbindung nur unter `moz-extension:`; die eigenständige Anwendung bleibt unabhängig. Der Download in der Erweiterung verwendet einen Blob statt des lokalen Export-Endpunkts. `engine-worker.js` verwendet mehrere WASM-Threads nur in einem isolierten Kontext, ansonsten einen Thread. Die Erweiterungs-CSP erlaubt WebAssembly und beschränkt Verbindungen auf eigene Ressourcen.

Die Analyseansicht verwendet ausschließlich `runtime.sendMessage` für Tab-Auswahl und Tag-Übernahme. Der Hintergrundteil prüft Absender, Nachrichtendaten und den cake.ski-Ursprung des Ziel-Tabs; eingebettete Ansichten dürfen nur ihren eigenen Upload-Tab ansprechen. Erst der Hintergrundteil verwendet `tabs.sendMessage`, da die eingebettete Firefox-Ansicht keinen Zugriff auf `browser.tabs` hat.

`extension/content.js` nimmt Übernahmen nur vom eigenen Hintergrundteil an. `upload-adapter.mjs` identifiziert sichtbare Upload-Felder, prüft Dateinamen und ergänzt erlaubte Tags über den Enter-Eingabeweg. Jede Übernahme wird anhand der sichtbaren Tag-Pills bestätigt. Bei Fehlern bleiben bereits ergänzte und bestehende Tags erhalten; es gibt keinen automatischen Rollback. Der Adapter schreibt weder Dateien noch Captions, Performer, Bestätigungen oder Veröffentlichungszustände.

Das Firefox-Paket verwendet ein Manifest-V3-Hintergrundskript und enthält Modell, WASM-Runtime, Lizenzen und Herkunftsmetadaten. Der Paketbau nutzt eine feste Dateiliste und prüft die großen Assets vor dem Kopieren. Installation und Testgrenzen stehen unter [Firefox](FIREFOX.md).

## Einstellungen und Sprache

`preferences.mjs` normalisiert ausschließlich Sprache, Bildanzahl, benutzerdefinierte Tag-Ausschlüsse und zwei Anzeigeoptionen. Die eigenständige Anwendung speichert diesen kleinen Datensatz unter `cake-tagger-settings-v1` in `localStorage`. Die Erweiterungsansichten verwenden `runtime.sendMessage`; `settings-background.mjs` liest und schreibt denselben Schlüssel in `storage.local` und verteilt Änderungen an Erweiterungsansichten und cake.ski-Content-Scripts. Website-Content-Scripts dürfen Einstellungen lesen, aber nicht speichern. Die zusätzliche Firefox-Berechtigung `storage` dient nur diesen Einstellungen. Videos, Ergebnisse, Korrekturen und Tokens sind nicht Bestandteil des Datensatzes.

`settings-ui.mjs` rendert dasselbe Formular in der Hauptseite und der eingebetteten Analyse. Die Bildanzahl wird ausschließlich im Einstellungsmenü ausgewählt; der Analysebereich enthält nur die Analyseaktionen. Die Formulardaten werden erst mit Speichern übernommen. Standardwerte setzt nur den Entwurf zurück. Anzeigeoptionen wirken auf bestehende Ergebnisse, ohne Auswahlen oder Scores zu ändern; ausgeblendete unsichere Kandidaten bleiben im Export erhalten. Bereits ausgewählte unsichere Tags bleiben sichtbar. Ausschlüsse wirken bei der nächsten Analyse und sind Teil des Cache-Schlüssels. Ein laufender Analyse-Durchgang verwendet einen unveränderlichen Einstellungssnapshot. Frühere manuelle Korrekturen werden beim erneuten Analysieren weiterhin übernommen.

`i18n.mjs` übersetzt Bedienelemente und Analysezustände in Deutsch oder Englisch; die automatische Auswahl folgt der Browsersprache (Deutsch bei `de`, sonst Englisch). Tagnamen bleiben unverändert. Die Standalone- und Erweiterungsspeicher sind getrennt.
