# Prüfung

`scripts/Test.ps1` prüft die JavaScript-Syntax und führt synthetische Tests für Tag-Aggregation, Zuordnung, Bildanzahl, Ergebnisvalidierung, Herkunft und Export aus. Der Download-Test startet einen isolierten Dienst unter `work/` auf einem freien Port: Export-Zugriffe ohne Token müssen abgewiesen werden, ein gültiger Snapshot muss als Anhang verfügbar sein, und es dürfen keine Ergebnisdateien entstehen. Alte Korrekturdateien dürfen nicht eingelesen oder verändert werden.

## Browser-Prüfung

1. Leere Startansicht, Upload-Bereich und automatische Bildanzahl prüfen.
2. Videos auswählen und analysieren; Vorschläge, Scores und zunächst nicht ausgewählte unsichere Kandidaten prüfen.
3. Tags ergänzen und abwählen; der Auswahlzähler muss folgen.
4. Dieselbe Datei innerhalb der Sitzung erneut auswählen: Die Auswahl bleibt erhalten.
5. JSON herunterladen; Auswahl, Modell-Scores und Laufzeitangaben prüfen. Im Projekt darf keine neue Ergebnisdatei entstehen.
6. Seite neu laden: Ergebnisse dürfen nicht wiederhergestellt werden.
7. Abbruch, ungültige Dateien und die Darstellung auf schmalen Bildschirmen prüfen.

Automatisierte Tests messen keine Erkennungsgenauigkeit. Dafür ist eine separat bewertete Testmenge erforderlich. Persönliche Testberichte und Videodaten gehören nicht in Git oder das Weitergabepaket.

Vorschaubild mit Maus und Tastatur öffnen, zum nächsten und vorherigen Bild wechseln, Escape und die Schließen-Schaltfläche prüfen. Die ursprüngliche Seite muss dabei unverändert bleiben und anschließend wieder bedienbar sein.
## Firefox-Integration

Die automatisierten Prüfungen decken eindeutige Dateizuordnung, Abweisung doppelter Namen, Tag-Deduplizierung, Erhalt gemeinsamer Tags und Ausschlüsse sowie die Manifest-Beschränkungen ab. Die Browserprüfung verwendet die originale Typeahead-Komponente mit lokalen API-Antworten und synthetischen Enter-Ereignissen. Die vollständige Firefox-Erweiterung einschließlich Berechtigungen, Content-Script und Modell-Worker ist zusätzlich direkt in Firefox zu prüfen. Dabei nur selbst ausgewählte Testdateien verwenden; cake.ski überträgt Bulk-Dateien bereits beim Auswählen als Entwürfe.
