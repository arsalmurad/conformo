# Wie Conformo mit neuen Regelversionen Schritt hält

English version: [UPDATES.md](UPDATES.md).

## Was fest eingebunden ist

Conformo prüft mit den offiziellen Regeldateien, und zwar unverändert: der KoSIT-Prüfkonfiguration für XRechnung,
dem CEN-Schematron zur EN 16931, den Regeln für Peppol BIS Billing 3.0 und den französischen CTC-Regeln. Jede davon
ist in `tools/artefacts.manifest.json` auf eine genaue Version festgelegt und über einen SHA-256-Hash oder einen
Git-Commit abgesichert. Jedes Prüfergebnis lässt sich dadurch exakt nachvollziehen.

Welche Versionen gerade gelten, sehen Sie an zwei Stellen:

- in [CONFORMANCE.md](CONFORMANCE.md), Tabelle „Pinned inputs“;
- in jedem Prüfergebnis: `result.ruleSets` nennt jedes Regelwerk mit Herausgeber und Version, zum Beispiel
  „KoSIT validator-configuration-xrechnung 2026-08-31 (XRechnung 3.0.2)“.

## Die tägliche Prüfung

Jeden Tag um 06:17 Uhr UTC fragt ein GitHub-Workflow (`.github/workflows/upstream.yml`) bei jedem Herausgeber nach
dem neuesten Release: bei KoSIT und OpenPeppol auf GitHub, bei den GitHub-Tags der CEN, bei Maven Central und bei
PyPI. Das Ergebnis wird mit der eingebundenen Version verglichen.

Veröffentlicht die KoSIT, die CEN oder OpenPeppol ein neues Release, passiert Folgendes:

1. Es wird ein Issue eröffnet, Titel: `Upstream update: <Artefakt> <eingebunden> -> <neu>`. Dasselbe Update wird nie
   doppelt gemeldet, und das Issue schließt sich von selbst, sobald die neue Version eingebunden ist.
2. Der Workflow bindet das neue Release auf einem eigenen Branch ein (neue Version, frisch berechneter Hash) und
   lässt danach alle Tests laufen, dazu die komplette XRechnung-Testsuite der KoSIT gegen den offiziellen
   KoSIT-Validator.
3. Anschließend öffnet er einen Pull Request, der klar sagt, ob Conformo noch zu 100 % mit dem KoSIT-Validator
   übereinstimmt, und die Konformitätstabelle enthält. Schlägt ein Schritt fehl, ist der Pull Request ein Entwurf
   mit „[needs work]“ im Titel, dem fehlgeschlagenen Schritt und dem Log-Auszug. Automatisch gemergt wird nichts.

Die KoSIT veröffentlicht Prüfkonfiguration und Testsuite gemeinsam und mit demselben Datum. Conformo aktualisiert
beide deshalb auch immer zusammen.

Die KoSIT-Konfiguration trägt als Version ihr Release-Datum: Release 2026-08-31 (Tag `v2026-08-31`, Zip
`xrechnung-3.0.2-validator-configuration-2026-08-31.zip`). Der KoSIT-Validator gibt beim Start das Build-Datum
desselben Pakets aus: Build-Datum 2026-09-02. Conformo nennt den Release-Namen, 2026-08-31; beide Daten gehören zu ein
und demselben Paket.

## Einen Update-Pull-Request mergen

Die Commits auf dem Branch stammen vom Maintainer, ein normaler Squash-Merge übernimmt aber den Autor des Pull
Requests, und das ist hier `github-actions[bot]`. Damit die Historie unter dem Namen des Maintainers bleibt, gibt es
zwei Wege:

- `gh pr merge <Nummer> --squash --author-email hello@arsalmurad.com`
- oder auf der Pull-Request-Seite „Rebase and merge“ wählen; das behält die Commits des Branches mit ihrem Autor.

Der Weg über `--author-email` wurde noch nicht benutzt; prüfen Sie den Autor des ersten damit erzeugten Commits. Die
E-Mail-Adresse muss beim mergenden GitHub-Konto bestätigt sein.

## Die Release-Regel

Eine neue Regelversion wird nur ausgeliefert, wenn Conformo zu 100 % mit dem offiziellen KoSIT-Validator
übereinstimmt, gemessen auf der kompletten KoSIT-Testsuite und den CEN-Beispielen. Alles darunter bleibt ein
Pull-Request-Entwurf. Derselbe Lauf verlangt außerdem, dass Conformo auf jeder Beispieldatei dasselbe Ergebnis liefert
wie die Regeldateien der Herausgeber; jede Abweichung ohne schriftliche Begründung lässt ihn scheitern.

## Was weiterhin von Hand geschieht

- **SaxonJS-Laufzeit** (die XSLT-Engine, die die Regeln im Browser ausführt). Saxonica bietet keinen maschinenlesbaren
  Release-Feed an, daher steht sie in der Prüfung als „manual check“.
- **Neue Hauptversionen von factur-x.** Das Paket liefert die französischen CTC-Regeln und die Factur-X-Schemas. Mit
  Version 7.x wurden die Schematron-Dateien umbenannt, die Conformo liest. Eine neue Hauptversion erzeugt deshalb ein
  Issue mit dem Hinweis auf manuelle Prüfung statt einer automatischen Aktualisierung.
- Der KoSIT-Validator selbst, SchXslt2 und die KSeF-Dokumentation werden gemeldet und bekommen ein Issue, werden aber
  von Hand aktualisiert: Sie sind Werkzeuge und Referenzen, keine Regelquellen.

Selbst ausführen: `node tools/check-upstream.mjs` (schreibt `out/upstream.md` und `out/upstream.json`).
