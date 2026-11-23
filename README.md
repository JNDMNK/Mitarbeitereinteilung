# Mitarbeitereinteilung

Web-App zur täglichen Einteilung von Monteuren auf Fahrzeuge und von Fahrzeugen auf Baustellen.
Next.js 16 · Prisma 7 · SQLite · Tailwind CSS.

> Status: in Entwicklung. Installationsanleitung für Docker/UnRaid/Nginx folgt im letzten Schritt.

## Lokale Entwicklung

```bash
npm install
cp .env.example .env          # DATABASE_URL=file:./data/dev.db, APP_URL=http://localhost:3000, TRUST_PROXY=0
npx prisma migrate dev        # Datenbank anlegen
npm run db:seed               # Stammdaten + Demodaten
npm run dev
```

Demo-Logins nach dem Seed (Passwort jeweils `Passwort123!`):

| Benutzer | Rolle |
|---|---|
| `admin` | Admin |
| `einteiler` | Einteiler |
| `max`, `jonas` | Mitarbeiter |

Weitere Befehle: `npm test` (Unit-Tests), `npm run typecheck`, `npm run lint`.

Architektur und Datenmodell: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)
