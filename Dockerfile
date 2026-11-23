# syntax=docker/dockerfile:1

# ---- 1. Abhängigkeiten ------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- 2. Build ---------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

# ---- 3. Laufzeit (klein, ohne Build-Werkzeuge) -------------------------------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/einteilung.db \
    TRUST_PROXY=1 \
    TZ=Europe/Berlin \
    PUID=99 \
    PGID=100

COPY --from=builder --chown=root:root /app/.next/standalone ./
COPY --from=builder --chown=root:root /app/.next/static ./.next/static
COPY --from=builder --chown=root:root /app/public ./public
COPY --from=builder --chown=root:root /app/prisma/migrations ./prisma/migrations
COPY --chown=root:root scripts/migrate.mjs ./scripts/migrate.mjs
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

LABEL org.opencontainers.image.title="Mitarbeitereinteilung" \
      org.opencontainers.image.description="Einteilung von Monteuren auf Fahrzeuge und Baustellen" \
      org.opencontainers.image.source="https://github.com/JNDMNK/Mitarbeitereinteilung" \
      org.opencontainers.image.licenses="UNLICENSED"

# Startet als root nur, um /data vorzubereiten; die App läuft danach als PUID:PGID
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
