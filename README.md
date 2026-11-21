# Schlosshotel Kitzbühel Digital Operations

Arbeitsplattform für Online-Marketing, Website, Direktvertrieb, Content und Reporting.

## Lokal öffnen

Mit Node.js 22 im Projektverzeichnis `npm ci` und anschließend `npm run dev -- --port 3210` ausführen. Im Browser [localhost:3210](http://localhost:3210) öffnen. Die lokale PostgreSQL-Engine PGlite speichert Daten in `.data/postgres`. Bei gesetzter `DATABASE_URL` nutzt die Anwendung stattdessen einen PostgreSQL-Server. Einen lokalen Prozess pro PGlite-Datenverzeichnis verwenden.

Jeder Browser startet ohne Anmeldung mit einem eigenen synthetischen Datenbestand. Ein Cookie hält die Zuordnung nach dem Neuladen aufrecht. Ein privates Browserfenster startet einen neuen Arbeitsbereich. Die Portalquellen des Startbestands liefern lokal hinterlegte Datensätze. Dateiimporte ergänzen oder aktualisieren den Arbeitsbestand.

## Arbeitsabläufe

- In **Website & Direktvertrieb** ein Angebot mit einem Foto aus der Mediathek anlegen oder bearbeiten und die Preise vergleichen. Bei einer Abweichung wird eine Aufgabe erzeugt, sofern für das Angebot noch keine offene Aufgabe besteht. Nach einem korrigierten Quellwert dieselbe Prüfung erneut starten.
- Ein Angebot im Bearbeitungsfenster über **Angebot löschen** entfernen. Der Vorgang löst Verknüpfungen und bewahrt vorhandene Kampagnen, Beiträge und Prüfeinträge. **Mediathek verwalten** zeigt eigene Uploads im Angebotseditor und Content-Studio. Zum Löschen eines verwendeten Bildes zuerst die Zuordnung im betreffenden Eintrag lösen oder das Bild dort ersetzen und speichern.
- Unter **Website- und SEO-Check** den Status, Titel, die Meta-Beschreibung, H1 und Buchungslinks im HTML einer öffentlichen Hotelseite prüfen. Unter **Kampagnen** aus Titel, Kanal und Zieladresse einen Tracking-Link mit UTM-Parametern erzeugen.
- In **Kampagnen** Start und Ende setzen, den Kalender öffnen und Messwerte einer einzelnen Kampagne zuordnen. Die Budgetregel erzeugt bei Überschreitung eine Aufgabe. Geplante Kampagnen können vor ihrem Start ein Content-Briefing auslösen.
- Im **Content-Studio** mit **Instagram-Carousel** einen Beitrag anlegen. Eigene Bilder zur Mediathek hochladen und dem ausgewählten Slide per Thumbnail ein Motiv zuweisen. Den Bildausschnitt direkt in der Vorschau verschieben oder mit den Reglern unter **Bild gestalten** einstellen. Einzelne PNGs oder alle Slides mit Caption als ZIP herunterladen.
- Mit **Newsletter** den separaten E-Mail-Editor öffnen. Betreff, Vorschautext, Titelbild, Text und Link bearbeiten. Das HTML-Paket enthält Entwurf, Betreff, Vorschautext und gegebenenfalls das Titelbild. Der Newsletter-Dienst kann das Bild beim Einrichten des Versands als Kampagnenmedium einbinden.
- Unter **Datenquellen** CSV- oder Excel-Dateien für Kennzahlen, Angebote, Bewertungen und Agenturbudgets importieren. Jeder Dateityp bietet eine Vorlage und eine Vorschau. Dort lassen sich auch Zeitpläne, technische Vorgänge, Schulungsunterlagen und Bewertungen digitaler Lösungen verwalten. Der erste geplante Lauf startet zeitnah. Weitere Läufe folgen dem gewählten Intervall.
- Unter **Datenquellen → Kanäle verwalten** Kanäle hinzufügen, umbenennen und ein- oder ausblenden. Bestehende Zuordnungen verwenden die interne Kanalreferenz weiterhin. Die Importdatei akzeptiert den aktuellen Namen oder die ursprüngliche Referenz.
- Unter **Bewertungen** Antworten zur Freigabe vorbereiten und Portalprofile mit den zentralen Markenangaben abgleichen.
- Unter **Berichte** Kennzahlen, Kampagnenkosten, freigegebene Inhalte und Maßnahmen für einen Zeitraum zusammenführen. **Druckansicht** öffnet den fertig gesetzten A4-Bericht. **PDF herunterladen** speichert dieselbe Druckfassung als Datei.

Mit `OPENAI_API_KEY` und `OPENAI_MODEL` steht textgenerierende KI zur Verfügung. Ohne Konfiguration erzeugen die als Textvorlagen gekennzeichneten Funktionen lokale Entwürfe. Für einen öffentlich zugänglichen Betrieb empfiehlt sich, den Modellschnittstellenzugang am Reverse Proxy zu begrenzen und ausschließlich synthetische oder geeignete aggregierte Daten zu verwenden.

## Produktionsbereitstellung

Für einen PostgreSQL-Container und die Webanwendung mit Docker Compose eine lokale `.env` aus `.env.example` anlegen und ein URL-taugliches PostgreSQL-Kennwort setzen. `docker compose up -d --build` bindet die Anwendung auf Port 3210 an die Loopback-Adresse. Auf dem VPS veröffentlicht `docker compose -f compose.yaml -f compose.vps.yaml up -d --build` die Webanwendung zusätzlich über den vorhandenen Traefik-Proxy im Netzwerk `coolify` unter `https://schlosshotelkitzbuehel.aiconso.eu`. Datenbank-Volumes für wiederholte Deployments beibehalten.

`npm run typecheck` und `npm run build` prüfen den Quellcode und Produktionsbuild. `npm run test:workflow` prüft Kampagnen, Importvalidierung, Budgetregeln, Content-Freigaben, Angebotsabgleich und Datenisolation gegen einen laufenden Server. Mit `WORKFLOW_URL` lässt sich eine andere lokale Testadresse angeben.
