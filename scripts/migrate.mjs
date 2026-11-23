// Wendet ausstehende Prisma-Migrationen (prisma/migrations/*/migration.sql) auf die
// SQLite-Datenbank an. Kompatibel zur Tabelle _prisma_migrations von `prisma migrate`,
// benötigt aber keine Prisma-CLI im Container.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:/data/einteilung.db";
if (!url.startsWith("file:")) {
  console.log("[migrate] DATABASE_URL ist keine SQLite-Datei – bitte `prisma migrate deploy` verwenden. Übersprungen.");
  process.exit(0);
}
const file = url.slice("file:".length);
mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

const dir = process.env.MIGRATIONS_DIR ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "../prisma/migrations");
if (!existsSync(dir)) {
  console.error(`[migrate] Migrationsordner fehlt: ${dir}`);
  process.exit(1);
}

const db = new Database(file);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 10000");
db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`);

const applied = new Map(
  db.prepare(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`).all().map((r) => [r.migration_name, r]),
);

const names = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "migration.sql")))
  .map((d) => d.name)
  .sort();

let count = 0;
for (const name of names) {
  const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const row = applied.get(name);
  if (row && !row.rolled_back_at) {
    if (!row.finished_at) {
      console.error(`[migrate] Migration ${name} ist früher fehlgeschlagen. Bitte Backup einspielen oder manuell prüfen.`);
      process.exit(1);
    }
    if (row.checksum !== checksum) console.warn(`[migrate] Warnung: Migration ${name} wurde nach dem Anwenden verändert.`);
    continue;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)`).run(id, checksum, name, now);
  try {
    // Tabellen-Umbauten von Prisma schalten Fremdschlüssel per PRAGMA ab – das wirkt nicht in Transaktionen
    if (/PRAGMA\s+foreign_keys/i.test(sql)) db.exec(sql);
    else db.transaction(() => db.exec(sql))();
    db.prepare(`UPDATE "_prisma_migrations" SET finished_at = ?, applied_steps_count = 1 WHERE id = ?`).run(new Date().toISOString(), id);
    console.log(`[migrate] angewendet: ${name}`);
    count++;
  } catch (err) {
    db.prepare(`UPDATE "_prisma_migrations" SET logs = ? WHERE id = ?`).run(String(err), id);
    console.error(`[migrate] Fehler in ${name}:`, err);
    process.exit(1);
  }
}
console.log(count ? `[migrate] ${count} Migration(en) angewendet.` : "[migrate] Datenbank ist aktuell.");
db.close();
