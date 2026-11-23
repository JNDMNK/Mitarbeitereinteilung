#!/bin/sh
# Start des Containers:
#  1. als root: Datenordner anlegen und an PUID:PGID übergeben (Unraid: 99:100)
#  2. als PUID:PGID weiter: Datenbank-Migrationen, dann Server
set -e

PUID="${PUID:-99}"
PGID="${PGID:-100}"
DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups"
  chown -R "$PUID:$PGID" "$DATA_DIR"
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups --inh-caps=-all "$0" "$@"
fi

if [ -z "$SESSION_SECRET" ] || [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "FEHLER: SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen."
  echo "        Erzeugen z. B. mit: openssl rand -base64 48"
  exit 1
fi
if [ -z "$APP_URL" ]; then
  echo "WARNUNG: APP_URL ist nicht gesetzt (z. B. https://einteilung.example.de)."
fi

node /app/scripts/migrate.mjs
exec node /app/server.js
