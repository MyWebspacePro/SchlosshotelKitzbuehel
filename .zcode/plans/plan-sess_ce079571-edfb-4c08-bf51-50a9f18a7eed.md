# NUR PRÜFUNG — nichts wird implementiert

**Wichtig:** Es gibt in diesem Plan **keine Implementierung und keine Code-Änderung**. Einziges Ziel: prüfen, ob das Projekt funktional ist. Der Freigabe-Dialog startet ausschließlich die unten stehenden Prüfschritte. Am Ende kommt ein Prüfbericht — mehr nicht.

## Was geprüft wird (alles headless, nichts auf dem Desktop im Vordergrund)

### 1. Statische Checks
- `npm run typecheck`
- `npm run build` (Produktionsbuild, erzeugt nur `.next`-Artefakte)

### 2. Mitgelieferte Tests (headless)
- Dev-Server im Hintergrund auf Port 3210 starten, danach stoppen
- `npm run test:workflow` + `npm run test:auth` — Ausgaben zitiert im Bericht

### 3. Spezialisierte Review-Subagenten (parallel, nur lesend)
- **Backend-Agent**: `lib/store.ts`, `lib/report.ts`, `lib/report-pdf.ts`, `lib/accounts.ts`, `lib/providers.ts`, `lib/passwords.ts`, `lib/workspace-cookie.ts`, `lib/import-fields.ts`, `lib/website-check.ts`, `lib/website.ts`, `lib/content-export.ts`, `lib/seed.ts`, `app/api/**/route.ts`, `instrumentation.ts` — Korrektheit, Validierung, Auth/Sicherheit, Fehlerbehandlung, Concurrency
- **Frontend-Agent**: `app/cockpit.tsx` + alle Komponenten — Prop-Verdrahtung, Interaktionslogik, vollständige CSS-Klassen-Kreuzprüfung, Screen-/Print-Layouts
- **Test-Qualitäts-Agent**: `scripts/verify-workflow.mjs` + `scripts/verify-auth.mjs` — decken die Assertions die README-Versprechen ab?

### 4. Headless-Durchklick der UI (Browser-Automatisation, unsichtbar)
Hauptabläufe gegen localhost:3210 mit Screenshots und Konsolenfehler-Check: Übersicht, Angebot + Prüfung + Historie, Website-/SEO-Check, Kampagnen (Kalender, Tracking-Link, Budgetregel), Content-Studio (Carousel, Newsletter), Bewertungen (Antwort/Freigabe/Export), Berichte (alle 5 Typen + PDF), Agenturen, Datenquellen (Import), Einstellungen, Team-Anmeldung.

### 5. PDF-Prüfung
Erzeugten A4-Bericht rendern und visuell beurteilen (pdf:visual-judge).

## Ergebnis
Konsolidierter Prüfbericht: ✅ funktioniert / ⚠️ Risiko / ❌ defekt, jeweils mit `file:line`. **Keine Fixes** — reparieren übernehme ich nur auf dein ausdrückliches Okay, danach separat.

## Nebenwirkungen
Nur `.next`-Buildartefakte und neue Gast-Testarbeitsbereiche in der bestehenden lokalen `.data`-DB. Quellcode und bestehende Daten bleiben unangetastet.