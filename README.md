# Mitarbeitereinteilung

Web-App zur täglichen Einteilung von Monteuren auf Fahrzeuge und von Fahrzeugen auf Baustellen –
für PC und Smartphone, selbst gehostet als ein einzelner Docker-Container (z. B. auf Unraid).

Next.js 16 · Prisma 7 · SQLite · Tailwind CSS

- [Installation auf Unraid](#installation-auf-unraid)
- [Reverse Proxy (Nginx Proxy Manager / Nginx)](#reverse-proxy)
- [Erster Start](#erster-start)
- [Updates](#updates)
- [Datensicherung](#datensicherung)
- [Konfiguration (Umgebungsvariablen)](#konfiguration)
- [Fehlersuche](#fehlersuche)
- [Lokale Entwicklung](#lokale-entwicklung)

---

## Installation auf Unraid

Das fertige Image wird bei jeder Änderung automatisch von GitHub gebaut:
`ghcr.io/jndmnk/mitarbeitereinteilung:latest`

### 1. Vorlage (Template) holen

Unraid-Weboberfläche → oben rechts **Terminal** öffnen und ausführen:

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-Mitarbeitereinteilung.xml https://raw.githubusercontent.com/JNDMNK/Mitarbeitereinteilung/main/unraid/einteilung.xml
```

### 2. Geheimen Schlüssel erzeugen

Im selben Terminal:

```bash
openssl rand -base64 48
```

Die ausgegebene Zeile kopieren – das ist der `SESSION_SECRET`.

### 3. Container anlegen

**Docker** → **Add Container** → bei **Template** „Mitarbeitereinteilung“ auswählen und ausfüllen:

| Feld | Was eintragen |
|---|---|
| **WebUI-Port** | `3010` (vorbelegt; bitte **nicht 3000** – den nutzt der Nginx Proxy Manager intern) |
| **Daten** | `/mnt/user/appdata/einteilung` (vorbelegt) |
| **APP_URL** | Die Adresse, unter der die App später im Browser aufgerufen wird, z. B. `https://einteilung.meinefirma.de` – ohne `/` am Ende |
| **SESSION_SECRET** | Den Wert aus Schritt 2 |
| **INITIAL_ADMIN_USER** | z. B. `admin` |
| **INITIAL_ADMIN_PASSWORD** | Start-Passwort (mind. 8 Zeichen); später unter „Konto“ änderbar |

Unter **Show more settings** (optional): `TRUST_PROXY` (1 = hinter Nginx), `TZ`, `PUID`/`PGID` (Unraid-Standard 99/100),
`SEED_DEMO=1` legt beim ersten Start Beispieldaten zum Ausprobieren an.

**Apply** – Unraid lädt das Image und startet den Container. Im Log (Docker → Symbol → Logs) erscheint:

```
[migrate] 1 Migration(en) angewendet.
[bootstrap] Erster Admin "admin" angelegt. Passwort kann unter „Konto“ geändert werden.
```

> Ohne Reverse Proxy (nur im Heimnetz testen): `APP_URL` auf `http://<Unraid-IP>:3010` und `TRUST_PROXY` auf `0` setzen.

---

## Reverse Proxy

Die App sollte von außen **nur über HTTPS** erreichbar sein. Der Proxy leitet auf `http://<Unraid-IP>:3010` weiter
(den WebUI-Port aus dem Template).

### Nginx Proxy Manager (NPM)

1. **Hosts → Proxy Hosts → Add Proxy Host**
   - *Domain Names*: `einteilung.meinefirma.de`
   - *Scheme*: `http` · *Forward Hostname/IP*: LAN-IP des Unraid-Servers (nicht `localhost`) · *Forward Port*: `3010`
   - *Block Common Exploits*: an
2. Reiter **SSL**: *Request a new SSL Certificate* (Let's Encrypt), **Force SSL** an, **HTTP/2 Support** an, **HSTS Enabled** an.
3. Reiter **Advanced** – dieses Feld einfügen (nötig für Live-Aktualisierung und Backup-Upload):

   ```nginx
   # Live-Updates (Server-Sent Events) nicht puffern, Verbindungen lange offen halten
   proxy_buffering off;
   proxy_cache off;
   proxy_read_timeout 1h;
   proxy_send_timeout 1h;
   # Upload von Datensicherungen
   client_max_body_size 50m;
   ```
4. **Save**. Im Router muss Port 443 (und 80 für Let's Encrypt) auf den Nginx Proxy Manager weitergeleitet sein.

NPM setzt `X-Forwarded-For` und `X-Forwarded-Proto` automatisch – deshalb `TRUST_PROXY=1`.

### Zugriff von außen über die FritzBox

Die Kette muss lauten: **Internet → FritzBox → Nginx Proxy Manager (HTTPS) → App**.

```
https://einteilung.meinefirma.de:8445
        │
FritzBox  extern 8445 ──► 192.168.x.x : <HTTPS-Port des Proxy Managers>   (nicht direkt auf die App!)
        │
Nginx Proxy Manager (Proxy Host) ──► 192.168.x.x : 3010  (WebUI-Port der App)
```

1. **HTTPS-Port des Proxy Managers ermitteln:** Unraid → Docker → Proxy Manager → *Port Mappings*,
   Zeile mit Container-Port **443** → der Host-Port daneben (auf Unraid oft nicht 443, da Unraid 443 selbst nutzt).
2. **FritzBox** → *Internet → Freigaben → Portfreigaben* → Gerät (Unraid) → *Neue Freigabe*:
   extern `443` (oder z. B. `8445`, falls 443 schon von MyFRITZ belegt ist) → intern der Port aus Schritt 1.
3. **Zertifikat:** Let's Encrypt prüft über Port 80. Entweder zusätzlich extern `80` auf den HTTP-Port des
   Proxy Managers (Container-Port 80) freigeben – oder im Proxy Manager beim Zertifikat **„Use a DNS Challenge“**
   wählen (wenn der DNS-Anbieter unterstützt wird; bei `*.myfritz.net` nur über Port 80 möglich).
4. **APP_URL** genau so setzen, wie die Adresse im Browser aussieht – **mit Port**, wenn er nicht 443 ist:
   `APP_URL=https://einteilung.meinefirma.de:8445`
5. Testen mit dem Handy **über mobile Daten** (nicht im WLAN).

Passt die aufgerufene Adresse nicht zu `APP_URL`, zeigt die Login-Seite einen Hinweis mit beiden Adressen,
und im Container-Log steht `[csrf] Anfrage abgelehnt: Herkunft "…" passt nicht zu APP_URL "…"`.

### Nginx (klassisch, z. B. SWAG)

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name einteilung.meinefirma.de;

    ssl_certificate     /etc/letsencrypt/live/einteilung.meinefirma.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/einteilung.meinefirma.de/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;

    client_max_body_size 50m;

    location / {
        proxy_pass http://192.168.1.10:3010;   # LAN-IP des Unraid-Servers + WebUI-Port
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";

        # Server-Sent Events
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}

server {
    listen 80;
    server_name einteilung.meinefirma.de;
    return 301 https://$host$request_uri;
}
```

---

## Erster Start

1. `https://einteilung.meinefirma.de` aufrufen (genau die Adresse aus `APP_URL`).
2. Mit `INITIAL_ADMIN_USER` / `INITIAL_ADMIN_PASSWORD` anmelden und ein eigenes Passwort vergeben.
3. **Einstellungen**: Firmenname, Logo, Standard-Arbeitszeit.
4. **Stammdaten**: Abteilungen → Mitarbeiter (optional direkt mit Login) → Fahrzeuge (mit Standard-Besatzung) → Baustellen.
5. Für Einteiler unter **Stammdaten → Benutzer** einen Login mit Rolle *Einteiler* anlegen.

Auf dem Smartphone lässt sich die App über „Zum Startbildschirm hinzufügen“ wie eine App ablegen.

---

## Monitor-Anzeige (z. B. 55"-Fernseher in der Werkstatt)

1. Unter **Stammdaten → Benutzer** einen Login mit Rolle **Anzeige (Monitor)** anlegen (ohne Mitarbeiter).
2. Am Monitor-PC bzw. Smart-TV-Browser mit diesem Login anmelden – es öffnet sich automatisch `/anzeige`.
3. Oben **3 Tage** oder **5 Tage** wählen, mit ◀ ▶ Tage wechseln, über **Abwesenheiten** den Abwesenheitskalender ansehen (oder direkt `…/anzeige?tage=5` als Startseite eintragen) und **⛶ Vollbild** drücken.

Die Anzeige überspringt Wochenende und Feiertage, aktualisiert sich live, rückt um Mitternacht weiter und
passt die Schriftgröße automatisch so an, dass alle Tage ohne Scrollen auf den Bildschirm passen.
Der Anzeige-Login kann nichts einteilen oder bearbeiten und sieht keine anderen Seiten.
Tipp: Chrome/Edge im Kiosk-Modus starten (`--kiosk https://einteilung.example.de/anzeige?tage=5`).

## Updates

Unraid → **Docker** → bei *Mitarbeitereinteilung* auf **apply update** klicken (oder „Check for Updates“).
Datenbank-Änderungen werden beim Start automatisch übernommen. Vorher empfiehlt sich eine Datensicherung.

---

## Datensicherung

Alle Daten liegen in **`/mnt/user/appdata/einteilung`**:

| Datei/Ordner | Inhalt |
|---|---|
| `einteilung.db` (+ `-wal`, `-shm`) | Datenbank |
| `uploads/` | Firmenlogo |
| `backups/` | Exporte aus dem Admin-Bereich |

**Automatisch:** Plugin **Appdata Backup** (Community Applications) installieren und den Ordner einschließen –
das Plugin stoppt den Container während der Sicherung, dadurch ist die Datenbank konsistent.

**Manuell:** Container stoppen, Ordner kopieren, Container starten.

**In der App** (Admin → Einstellungen → Datensicherung):

- **Jetzt sichern & herunterladen** – konsistente Kopie der Datenbank, auch während des Betriebs.
- **Automatisch:** täglich eine Sicherung nach `backups/` (die letzten 14 Tage), dort auch herunterladbar.
- **Sicherung einspielen** – prüft die Datei (gültig, nicht beschädigt, mindestens ein aktiver Admin,
  nicht aus einer neueren App-Version), sichert vorher den aktuellen Stand (`vor-import-…`) und bringt ältere
  Sicherungen automatisch auf den aktuellen Datenbank-Stand. Danach müssen sich alle neu anmelden.

---

## Konfiguration

| Variable | Standard | Beschreibung |
|---|---|---|
| `APP_URL` | – | Öffentliche Adresse (wie im Browser). Pflicht. |
| `SESSION_SECRET` | – | Zufallswert ≥ 32 Zeichen. Pflicht. Ändern meldet alle ab. |
| `INITIAL_ADMIN_USER` / `INITIAL_ADMIN_PASSWORD` | – | Erster Admin, nur wenn noch kein Benutzer existiert |
| `PORT` | `3000` | Port im Container |
| `DATABASE_URL` | `file:/data/einteilung.db` | SQLite-Datei |
| `TRUST_PROXY` | `1` | Anzahl vertrauenswürdiger Proxys (X-Forwarded-For) |
| `TZ` | `Europe/Berlin` | Zeitzone |
| `PUID` / `PGID` | `99` / `100` | Besitzer der Dateien unter `/data` |
| `SEED_DEMO` | `0` | `1` = Beispieldaten beim ersten Start |

Docker Compose: siehe [`docker-compose.yml`](docker-compose.yml).

---

## Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| Container startet nicht, Log: „SESSION_SECRET fehlt“ | Wert aus `openssl rand -base64 48` eintragen |
| Domain zeigt `{"status":"OK","setup":true,"version":{…}}` | Das ist die Antwort des **Nginx Proxy Managers selbst** – seine interne API läuft auf Port 3000. Ursache: Ziel `localhost`/`127.0.0.1` im Proxy Host, oder der Proxy Manager läuft im Netzwerkmodus „host“ und die App nutzt ebenfalls Port 3000. Lösung: WebUI-Port der App auf z. B. `3010` ändern und im Proxy Host *LAN-IP des Unraid-Servers* + `3010` eintragen. Gegenprobe: `http://<Unraid-IP>:3010/api/health` → `{"status":"ok"}`; Domain danach im privaten Fenster testen. |
| 502 Bad Gateway | App läuft nicht oder falscher Port/IP im Proxy Host. Container-Log prüfen und die Gegenprobe oben machen. |
| Login klappt nicht / „Ungültige Herkunft der Anfrage“ | Die App wird unter einer anderen Adresse aufgerufen als in `APP_URL` eingetragen. Immer genau die `APP_URL` verwenden. Bei `https://…` funktioniert der Login nicht über `http://<IP>:3010` (Cookies nur über HTTPS). |
| Zu viele Anmeldeversuche | Nach 5 Fehlversuchen ist ein Konto 15 Min. gesperrt; Admin kann unter Stammdaten → Benutzer entsperren |
| Admin-Passwort vergessen | Anderen Admin bitten, es zurückzusetzen. Gibt es keinen: Container stoppen, `einteilung.db` sichern, Benutzer per SQLite-Werkzeug entfernen – beim Start wird der Admin aus `INITIAL_ADMIN_*` neu angelegt (nur wenn gar kein Benutzer existiert) |
| Gesundheitszustand | `http://<Unraid-IP>:3010/api/health` liefert `{"status":"ok"}` |

---

## Lokale Entwicklung

```bash
npm install
cp .env.example .env
```

In `.env` für die Entwicklung: `DATABASE_URL=file:./data/dev.db`, `APP_URL=http://localhost:3000`, `TRUST_PROXY=0`.

```bash
npx prisma migrate dev
npm run db:seed
npm run dev
```

Demo-Logins nach dem Seed (Passwort jeweils `Passwort123!`): `admin` (Admin), `einteiler` (Einteiler), `max`, `jonas` (Mitarbeiter).

Weitere Befehle: `npm test` · `npm run typecheck` · `npm run lint` · `docker build -t einteilung .`

Architektur und Datenmodell: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)
