# Architektur – Mitarbeitereinteilung (Entwurf, Schritt 1)

## Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Framework | Next.js 16 (App Router, TypeScript, `output: "standalone"`) | Ein Prozess für UI + API, kleines Docker-Image |
| DB | Prisma 7 + SQLite (`better-sqlite3`-Adapter), Datei unter `/data` | Kein DB-Server, Backup = Datei kopieren; Wechsel auf PostgreSQL über `provider` + `DATABASE_URL` |
| Validierung | zod (gemeinsam für Client und Server) | Eine Quelle für Regeln (15-Minuten-Raster, Pflichtfelder) |
| Client-State | TanStack Query | Optimistische Updates beim Drag & Drop, Rücknahme bei Konflikt (409) |
| Drag & Drop | dnd-kit (Pointer-, Touch- und Keyboard-Sensoren) | Maus, Touch und Tastatur |
| UI | Tailwind CSS 4, mobile-first, PWA (Manifest + Service Worker nur für App-Shell) | Keine Planungsdaten im Offline-Cache, damit nichts Veraltetes angezeigt wird |
| Passwörter | argon2id (`@node-rs/argon2`, vorkompiliert) | Kein Build-Werkzeug im Image nötig |
| Echtzeit | SSE-Route `/api/events` + In-Process-Event-Bus, Fallback Polling | Ein Container, daher reicht ein Prozess-Bus |

## Wichtige Modellentscheidungen (siehe `prisma/schema.prisma`)

1. **Tage als `"YYYY-MM-DD"`-String, Uhrzeiten als Minuten (Int).** Das vermeidet
   Zeitzonenfehler (Europe/Berlin vs. UTC, Sommerzeit), und Vergleiche
   (`startDate <= tag <= endDate`) laufen direkt in SQL.
2. **`VehicleDay`** (Fahrzeug an Tag X im Einsatz) ist die Klammer für Besatzung und
   Baustelleneinsätze:
   - Wird ein Fahrzeug an einem Tag erstmals auf eine Baustelle eingeplant (oder ohne
     Besatzung auf einen anderen Tag gezogen), werden die Standard-Mitarbeiter vorbelegt –
     außer Abwesende, Inaktive, anderweitig Eingeteilte und über die Sitzplätze hinaus.
     Wird nur eine einzelne Person auf ein freies Fahrzeug gesetzt, gibt es keine Vorbelegung.
   - Hat ein Fahrzeug Besatzung, aber keinen Einsatz, steht es im Pool.
   - „Fahrzeug inkl. Besatzung verschieben“ heißt: `SiteAssignment` umhängen bzw.
     `VehicleDay` auf einen anderen Tag kopieren.
3. **`CrewMember.date` redundant** → `@@unique([date, employeeId])` erzwingt
   „ein Mitarbeiter pro Tag auf genau einem Fahrzeug“ schon in der DB.
4. **Überschneidungen von Zeitfenstern** prüft der Server in einer Transaktion.
   SQLite serialisiert Schreibzugriffe, deshalb ist das sicher.
5. **Optimistische Sperre über `version`.** Jede Änderung schickt die gelesene Version
   mit. Passt sie nicht → HTTP 409, die UI meldet „Wurde inzwischen von X geändert“
   und lädt neu.
6. **Aufzählungen als String** (statt Prisma-`enum`). Das ist auf SQLite und
   PostgreSQL identisch; geprüft wird per zod.
7. **Deaktivieren statt Löschen** bei Stammdaten. Admins können deaktivierte Mitarbeiter, Fahrzeuge und Räume zusätzlich endgültig löschen (inkl. ihrer Einteilungen). Planungsdaten (Besatzung,
   Einsätze, Abwesenheiten) werden echt gelöscht, das Protokoll bleibt erhalten.

## Projektstruktur

```
mitarbeitereinteilung/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                  # Abwesenheitsarten, Abteilungen, Beispieldaten
├─ prisma.config.ts
├─ src/
│  ├─ app/
│  │  ├─ login/                # öffentlich: nur Login
│  │  ├─ (app)/                # alles hinter Login (Layout prüft Session)
│  │  │  ├─ planung/           # 3-Tages-Ansicht (Karten / Zeitleiste)
│  │  │  ├─ meine-einteilung/  # Startseite für die Rolle Mitarbeiter
│  │  │  ├─ abwesenheiten/
│  │  │  ├─ stammdaten/{mitarbeiter,fahrzeuge,baustellen,abteilungen,abwesenheitsarten,benutzer}/
│  │  │  ├─ protokoll/
│  │  │  ├─ einstellungen/     # Arbeitszeit, Firma/Logo, Backup (Admin)
│  │  │  ├─ konto/             # eigenes Passwort, Wochenende-Schalter
│  │  │  └─ druck/[datum]/     # Druckansicht / PDF über den Browser-Druck
│  │  ├─ api/
│  │  │  ├─ events/route.ts    # SSE
│  │  │  ├─ planning/…         # Besatzung, Einsätze, Tag übernehmen
│  │  │  ├─ backup/…           # Export/Import (Admin)
│  │  │  └─ …                  # CRUD Stammdaten
│  │  └─ manifest.ts           # PWA
│  ├─ server/                  # nur serverseitig
│  │  ├─ db.ts                 # Prisma-Client (SQLite: WAL, busy_timeout)
│  │  ├─ auth/                 # Sessions, argon2, Login-Sperre, Rate-Limit
│  │  ├─ authz.ts              # requireRole(), canEdit() – zentrale Rechteprüfung
│  │  ├─ csrf.ts               # Token-Prüfung + Origin-Abgleich mit APP_URL
│  │  ├─ services/             # Geschäftslogik: planning, absences, warnings, copyDay …
│  │  ├─ audit.ts
│  │  └─ events.ts             # Event-Bus für SSE
│  ├─ lib/                     # geteilt: Datums-/Zeit-Helfer, zod-Schemas, Konstanten
│  ├─ components/              # UI (planning/, dnd/, forms/, ui/)
│  └─ proxy.ts                 # Next-16-Middleware: Security-Header/CSP, Session-Weiterleitung
├─ public/icons/
├─ Dockerfile                  # multi-stage, non-root, node:22-slim
├─ docker-compose.yml
├─ unraid/einteilung.xml
└─ README.md                   # Installation, Nginx/NPM (SSE: proxy_buffering off), Backups
```

## Sicherheitskonzept (Kurzfassung)

- Alle Änderungen laufen über `/api/*`-Route-Handler mit: Session-Prüfung →
  Rollenprüfung (`authz.ts`) → CSRF (Header `X-CSRF-Token` + `Origin` == `APP_URL`)
  → zod → Service → Protokoll → Event.
- Cookie `__Host-session`: HttpOnly, Secure, SameSite=Lax. Lokal ohne HTTPS
  gibt es einen Fallback über `APP_URL=http://…`.
- Rate-Limit pro IP (In-Memory, IP aus `X-Forwarded-For`, aber nur, wenn
  `TRUST_PROXY=1` gesetzt ist) sowie Sperre pro Benutzer nach 5 Fehlversuchen
  für 15 Minuten.
- Header: CSP mit Nonce, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `X-Content-Type-Options`. HSTS setzt der Proxy.
