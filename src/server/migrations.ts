import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";

// Gleiche Logik wie scripts/migrate.mjs (Container-Start), hier für den Backup-Import.

export function migrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "prisma/migrations");
}

export function knownMigrations(): string[] {
  const dir = migrationsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

export function appliedMigrations(db: BetterSqlite3.Database): string[] {
  const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'`).get();
  if (!exists) return [];
  return (
    db.prepare(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).all() as { migration_name: string }[]
  ).map((r) => r.migration_name);
}

/** Fehlende Migrationen auf eine (z. B. ältere, importierte) Datenbank anwenden */
export function applyPendingMigrations(db: BetterSqlite3.Database): string[] {
  const done = new Set(appliedMigrations(db));
  const applied: string[] = [];
  for (const name of knownMigrations()) {
    if (done.has(name)) continue;
    const sql = readFileSync(path.join(migrationsDir(), name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const id = randomUUID();
    db.prepare(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)`).run(
      id,
      checksum,
      name,
      new Date().toISOString(),
    );
    if (/PRAGMA\s+foreign_keys/i.test(sql)) db.exec(sql);
    else db.transaction(() => db.exec(sql))();
    db.prepare(`UPDATE "_prisma_migrations" SET finished_at = ?, applied_steps_count = 1 WHERE id = ?`).run(new Date().toISOString(), id);
    applied.push(name);
  }
  return applied;
}
