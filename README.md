# Schlosshotel Kitzbühel Digital Operations

Arbeitsplattform für Online-Marketing, Website, Direktvertrieb, Content und Reporting.

## Lokal öffnen

Mit Node.js 22 im Projektverzeichnis `npm ci` und anschließend `npm run dev -- --port 3210` ausführen. Im Browser [localhost:3210](http://localhost:3210) öffnen. Die lokale PostgreSQL-Engine PGlite speichert Daten in `.data/postgres`. Bei gesetzter `DATABASE_URL` nutzt die Anwendung stattdessen einen PostgreSQL-Server. Einen lokalen Prozess pro PGlite-Datenverzeichnis verwenden.

Jeder Browser startet ohne Anmeldung mit einem eigenen synthetischen Datenbestand. Ein Cookie hält die Zuordnung nach dem Neuladen aufrecht. Ein privates Browserfenster startet einen neuen Arbeitsbereich. Pro Adresse können innerhalb von 15 Minuten bis zu 30 neue Gast-Arbeitsbereiche geöffnet werden. Bestehende Arbeitsbereiche bleiben zugänglich. Die Portalquellen des Startbestands liefern lokal hinterlegte Datensätze. Dateiimporte ergänzen oder aktualisieren den Arbeitsbestand.

Unter **Einstellungen → Personen, Zuständigkeiten & Zugänge** werden Name, Rolle und Zugangsdaten im selben Formular bearbeitet. Neue Personen erhalten beim Speichern ein Benutzerkonto. Das erste Konto schützt den Arbeitsbereich und erhält Administratorrechte. Weitere Konten werden dort vom Administrator angelegt. Über **Profilmenü → Mit Benutzerkonto anmelden** arbeiten diese Personen im gemeinsamen Bestand. Gäste können sich im Profilmenü abmelden und mit **Ohne Passwort fortfahren** ihren bisherigen Arbeitsbereich wieder öffnen. Der öffentliche Einstieg führt weiterhin in einen separaten Arbeitsbereich. Administratoren können Kennwörter neu setzen und Zugänge über die Personenliste deaktivieren.

## Arbeitsabläufe

- In **Website & Direktvertrieb** ein Angebot mit einem Foto aus der Mediathek anlegen oder bearbeiten und Preise sowie Verfügbarkeit vergleichen. Die Liste zeigt die letzte Prüfung pro Angebot. Gleichbleibende Ergebnisse aktualisieren die Uhrzeit. Geänderte Befunde lassen sich unter **Frühere Prüfergebnisse** nachvollziehen. Bei einer Abweichung wird eine Aufgabe erzeugt, sofern für das Angebot noch keine offene Aufgabe besteht.
- Ein Angebot im Bearbeitungsfenster über **Angebot löschen** entfernen. Der Vorgang löst Verknüpfungen und bewahrt vorhandene Kampagnen, Beiträge und Prüfeinträge. **Mediathek verwalten** zeigt eigene Uploads im Angebotseditor und Content-Studio. Zum Löschen eines verwendeten Bildes zuerst die Zuordnung im betreffenden Eintrag lösen oder das Bild dort ersetzen und speichern.
- Unter **Website- und SEO-Check** den Status, Titel, die Meta-Beschreibung, H1 und Buchungslinks im HTML einer öffentlichen Hotelseite prüfen. Unter **Kampagnen** aus Titel, Kanal und Zieladresse einen Tracking-Link mit UTM-Parametern erzeugen.
- In **Kampagnen** Start und Ende setzen, den Kalender öffnen und Messwerte einer einzelnen Kampagne zuordnen. Die Budgetregel erzeugt bei Überschreitung eine Aufgabe. Geplante Kampagnen können vor ihrem Start ein Content-Briefing auslösen.
- Im **Content-Studio** mit **Instagram-Carousel** einen Beitrag anlegen. Eigene Bilder zur Mediathek hochladen und dem ausgewählten Slide per Thumbnail ein Motiv zuweisen. Den Bildausschnitt direkt in der Vorschau verschieben oder mit den Reglern unter **Bild gestalten** einstellen. Einzelne PNGs oder alle Slides mit Caption als ZIP herunterladen.
- Mit **Newsletter** den separaten E-Mail-Editor öffnen. Betreff, Vorschautext, Titelbild, Text und Link bearbeiten. Das HTML-Paket enthält Entwurf, Betreff, Vorschautext und gegebenenfalls das Titelbild. Der Newsletter-Dienst kann das Bild beim Einrichten des Versands als Kampagnenmedium einbinden.
- Unter **Datenquellen** CSV- oder Excel-Dateien für Kennzahlen, Angebote, Bewertungen und Agenturbudgets importieren. Jeder Dateityp bietet eine Vorlage und eine Vorschau. Dort lassen sich auch Zeitpläne, technische Vorgänge, Schulungsunterlagen und Bewertungen digitaler Lösungen verwalten. Der erste geplante Lauf startet zeitnah. Weitere Läufe folgen dem gewählten Intervall.
- Unter **Agenturen & Budget** mehrere Kanäle pro Agentur zuordnen. Budget und Ist-Kosten gelten pro Agentur. Das Feld für Ist-Kosten kann bis zur Abrechnung leer bleiben. Für den Dateiimport eine Zeile pro Agentur verwenden, Kanäle mit `|` trennen und bei Aktualisierungen dieselbe Referenz verwenden.
- Unter **Einstellungen** Personen anlegen, umbenennen und deaktivieren sowie Kanäle und Verbindungen pflegen. Die Auswahl **Zuständig** übernimmt aktive Personen. Bestehende Aufgaben behalten ihre Zuordnung, wenn eine Person deaktiviert wird. Die Importdatei akzeptiert den aktuellen Kanalnamen oder seine ursprüngliche Referenz.
- Unter **Bewertungen** Google- und Booking.com-Bewertungen abrufen oder per Datei importieren. Der Originaltext, die Sterne und der Absender werden aus der Quelle übernommen. Im Cockpit lassen sich die Antworten vorbereiten, freigeben und exportieren.
- Unter **Berichte** Leistungsübersicht, Kampagnenleistung oder Website & Direktbuchungen für einen Zeitraum erstellen. Gästebewertungen und Agenturbudgets zeigen den erfassten Bestand zum Erstellungsdatum. Gespeicherte Berichte bleiben im Archiv. **Druckansicht** öffnet den A4-Bericht. **PDF herunterladen** speichert dieselbe Druckfassung als Datei.

Mit `OPENAI_API_KEY` und `OPENAI_MODEL` steht textgenerierende KI zur Verfügung. Ohne Konfiguration erzeugen die als Textvorlagen gekennzeichneten Funktionen lokale Entwürfe. Für einen öffentlich zugänglichen Betrieb empfiehlt sich, den Modellschnittstellenzugang am Reverse Proxy zu begrenzen und ausschließlich synthetische oder geeignete aggregierte Daten zu verwenden.

### Plattformzugänge

Unter **Einstellungen → Verbindungen** werden Referenz, Profiladresse und die Art der Datenübernahme gespeichert. Der Arbeitsbereichscode unter **API-Freigabe** gehört serverseitig in `CONNECTOR_WORKSPACE_TAG`. Nur der zugeordnete Arbeitsbereich kann die Serverzugänge verwenden.

Über **Dienst hinzufügen** lässt sich eine eigene Verbindung mit Kategorie, Kontoreferenz und HTTPS-Profiladresse anlegen. Eigene Dienste unterstützen Dateiimporte. Bei Bewertungen und Angeboten steht der Dienstname als Quelle in der Datei. Kennzahlen werden über den Kanal in der Datei zugeordnet.

- Google benötigt einen Business-Profile-OAuth-Client mit `business.manage` und einen Refresh-Token für den verifizierten Standort. Im Cockpit wird `accounts/<Konto-ID>/locations/<Standort-ID>` eingetragen.
- Booking.com benötigt einen Connectivity-Maschinenzugang mit Zugriff auf `review-api` und die vom Hotel freigegebene Unterkunft. Im Cockpit wird die numerische Unterkunfts-ID eingetragen.
- Instagram benötigt einen User-Token für die Instagram API mit Instagram Login und `instagram_business_basic` für ein Profikonto. `INSTAGRAM_API_VERSION` bestimmt die für die Meta-App verwendete API-Version. Die Verbindung prüft das Konto und liest Profilinformationen. Beiträge werden aus dem Content-Studio exportiert.

Die Variablen stehen in `.env.example`. Nach dem Hinterlegen der Serverzugänge die App neu starten, unter der jeweiligen Verbindung **Live-API** speichern und den Abruf unter **Datenquellen** starten.

## Produktionsbereitstellung

Für einen PostgreSQL-Container und die Webanwendung mit Docker Compose eine lokale `.env` aus `.env.example` anlegen und ein URL-taugliches PostgreSQL-Kennwort setzen. `docker compose up -d --build` bindet die Anwendung auf Port 3210 an die Loopback-Adresse. Auf dem VPS veröffentlicht `docker compose -f compose.yaml -f compose.vps.yaml up -d --build` die Webanwendung zusätzlich über den vorhandenen Traefik-Proxy im Netzwerk `coolify` unter `https://schlosshotelkitzbuehel.aiconso.eu`. Datenbank-Volumes für wiederholte Deployments beibehalten.

`npm run typecheck` und `npm run build` prüfen den Quellcode und Produktionsbuild. `npm run test:workflow` prüft Kampagnen, Importvalidierung, Budgetregeln, Content-Freigaben, Angebotsabgleich und Datenisolation gegen einen laufenden Server. Mit `WORKFLOW_URL` lässt sich eine andere lokale Testadresse angeben.
