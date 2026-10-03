# Prüfung

## Automatisiert

Im Projektordner ausführen:

```powershell
.\scripts\Test.ps1
```

Das Skript verwendet die mitgelieferte Node.js-Laufzeit. Es prüft die JavaScript-Syntax und führt Tests mit künstlichen Daten aus: Korrekturen wiederherstellen, Umbenennen bei gleicher Prüfsumme, ergänzte/entfernte Tags exportieren, unbekannte Ausgangsvorschläge behandeln und ungültige Angaben zurückweisen.

## Browser-Prüfung

Bei Änderungen am jeweiligen Ablauf prüfen:

1. Oberfläche starten; Dateien auswählen und analysieren.
2. Tag abwählen, einen ergänzen und Ergebnis als geprüft markieren.
3. Seite neu laden und Programm neu starten: Auswahl und Prüfstatus bleiben erhalten.
4. Dieselben Videos erneut auswählen: Korrekturen bleiben erhalten.
5. JSON speichern und Auswahl, Prüfstatus und Änderungen kontrollieren.
6. Bei Änderungen an der Analyse zusätzlich Abbruch und ungültige Videodateien prüfen.

Für die Weitergabe `scripts/Package.ps1` ausführen und das Paket in einen neuen Ordner entpacken. Dort müssen `Start.cmd` und die Analyse funktionieren, ohne lokale Ergebnisse oder Start-Tokens aus dem Arbeitsordner zu übernehmen.

Automatisierte Tests messen nicht die Erkennungsgenauigkeit. Dafür ist eine separat bewertete Testmenge erforderlich. Persönliche Testberichte und echte Videodaten gehören nicht in das Repository.
