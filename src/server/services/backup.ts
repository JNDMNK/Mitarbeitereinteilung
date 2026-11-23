import "server-only";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import Database from "better-sqlite3";
import { formatDate, todayIso } from "@/lib/dates";
import { audit } from "../audit";
import { db } from "../db";
import { env } from "../env";
import { badRequest } from "../errors";
import { publishChange } from "../events";
import { appliedMigrations, applyPendingMigrations, knownMigrations } from "../migrations";

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const KEEP_AUTO = 14;
const NAME_RE = /^(auto|manuell|vor-import)-\d{4}-\d{2}-\d{2}(-\d{6}(-\d{1,3})?)?\.db$/;

function liveDbPath(): string {
  const url = env().databaseUrl;
  if (!url.startsWith("file:")) throw badRequest("Datensicherung ist nur mit SQLite verfügbar.");
  return path.resolve(url.slice("file:".length));
}

export function backupDir(): string {
  return path.resolve(env().dataDir, "backups");
}

function stamp(): string {
  const now = new Date();
  const time = now.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour12: false }).replace(/:/g, "");
  return `${todayIso(now)}-${time}`;
}

/** Konsistente Kopie der laufenden Datenbank (SQLite-Backup-API, auch während Schreibzugriffen) */
export async function createBackup(kind: "auto" | "manuell" | "vor-import"): Promise<string> {
  await mkdir(backupDir(), { recursive: true });
  let name = kind === "auto" ? `auto-${todayIso()}.db` : `${kind}-${stamp()}.db`;
  // gleiche Sekunde: nicht überschreiben, sondern durchnummerieren
  for (let i = 2; kind !== "auto" && existsSync(path.join(backupDir(), name)); i++) name = name.replace(/(-\d+)?\.db$/, "") + `-${i}.db`;
  const target = path.join(backupDir(), name);
  const src = new Database(liveDbPath(), { readonly: true, fileMustExist: true });
  try {
    await src.backup(target);
  } finally {
    src.close();
  }
  return name;
}

export async function listBackups() {
  try {
    const files = (await readdir(backupDir())).filter((f) => NAME_RE.test(f));
    const withInfo = await Promise.all(
      files.map(async (f) => {
        const s = await stat(path.join(backupDir(), f));
        return { name: f, size: s.size, createdAt: s.mtime.toISOString() };
      }),
    );
    return withInfo.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** Datei als Download-Stream (nur Dateinamen aus dem Backup-Ordner, kein Pfad-Traversal) */
export async function backupFileStream(name: string) {
  if (!NAME_RE.test(name)) return null;
  const p = path.join(backupDir(), name);
  try {
    const s = await stat(p);
    return { stream: Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>, size: s.size };
  } catch {
    return null;
  }
}

/** Frische Sicherung zum Herunterladen */
export async function exportBackup(actorId: string) {
  const name = await createBackup("manuell");
  await audit(db, { userId: actorId, action: "backup.export", entityType: "Backup", entityId: name, summary: `Datensicherung heruntergeladen (${name})` });
  return name;
}

/** Tägliche automatische Sicherung, älteste über KEEP_AUTO hinaus löschen */
export async function autoBackupIfDue() {
  const today = `auto-${todayIso()}.db`;
  const existing = await listBackups();
  if (!existing.some((b) => b.name === today)) {
    await createBackup("auto");
    console.log(`[backup] Automatische Sicherung erstellt: ${today}`);
  }
  const autos = (await listBackups()).filter((b) => b.name.startsWith("auto-")).sort((a, b) => b.name.localeCompare(a.name));
  for (const old of autos.slice(KEEP_AUTO)) await rm(path.join(backupDir(), old.name), { force: true });
  // Sicherungen vor Importen und manuelle Downloads nach 30 Tagen entfernen
  const limit = Date.now() - 30 * 86_400_000;
  for (const b of await listBackups()) {
    if (!b.name.startsWith("auto-") && Date.parse(b.createdAt) < limit) await rm(path.join(backupDir(), b.name), { force: true });
  }
}

/**
 * Sicherung einspielen. Prüft Datei, legt vorher eine Sicherung des aktuellen Stands an,
 * spielt per SQLite-Backup-API in die laufende Datenbank ein und ergänzt fehlende Migrationen.
 */
export async function importBackup(actorId: string, data: Uint8Array): Promise<{ before: string; migrated: string[] }> {
  if (data.byteLength === 0) throw badRequest("Die Datei ist leer.");
  if (data.byteLength > MAX_IMPORT_BYTES) throw badRequest("Die Datei ist zu groß (max. 50 MB).");
  if (Buffer.from(data.subarray(0, 16)).toString("latin1") !== "SQLite format 3\0") {
    throw badRequest("Das ist keine Datensicherung dieser App (keine SQLite-Datei).");
  }

  await mkdir(backupDir(), { recursive: true });
  const upload = path.join(backupDir(), `.upload-${Date.now()}.db`);
  await writeFile(upload, data);
  try {
    // 1. Prüfen
    const check = new Database(upload, { fileMustExist: true });
    try {
      const ok = (check.pragma("quick_check", { simple: true }) as string) === "ok";
      if (!ok) throw badRequest("Die Datensicherung ist beschädigt.");
      const tables = new Set((check.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((t) => t.name));
      for (const t of ["User", "Employee", "Vehicle", "Site", "_prisma_migrations"]) {
        if (!tables.has(t)) throw badRequest("Das ist keine Datensicherung dieser App (Tabellen fehlen).");
      }
      const known = new Set(knownMigrations());
      const unknown = appliedMigrations(check).filter((m) => !known.has(m));
      if (unknown.length) throw badRequest("Die Sicherung stammt aus einer neueren Version der App. Bitte zuerst die App aktualisieren.");
      const admins = (check.prepare(`SELECT COUNT(*) AS c FROM "User" WHERE role = 'ADMIN' AND active = 1`).get() as { c: number }).c;
      if (admins === 0) throw badRequest("Die Sicherung enthält keinen aktiven Admin – Import abgebrochen, sonst wäre keine Anmeldung mehr möglich.");
    } finally {
      check.close();
    }

    // 2. Aktuellen Stand sichern
    const before = await createBackup("vor-import");

    // 3. Einspielen und auf aktuellen Stand bringen
    const src = new Database(upload, { readonly: true, fileMustExist: true });
    try {
      await src.backup(liveDbPath());
    } finally {
      src.close();
    }
    const live = new Database(liveDbPath(), { fileMustExist: true });
    let migrated: string[] = [];
    try {
      live.pragma("busy_timeout = 10000");
      migrated = applyPendingMigrations(live);
    } finally {
      live.close();
    }

    await audit(db, {
      userId: null,
      action: "backup.import",
      entityType: "Backup",
      entityId: before,
      summary: `Datensicherung eingespielt (vorheriger Stand gesichert als ${before})${migrated.length ? `, ${migrated.length} Migration(en) ergänzt` : ""}`,
      details: { actorId },
    });
    publishChange({ scope: "planning", userId: actorId });
    publishChange({ scope: "masterdata", userId: actorId });
    publishChange({ scope: "absences", userId: actorId });
    return { before, migrated };
  } finally {
    await rm(upload, { force: true });
  }
}

export function backupLabel(name: string): string {
  const m = /^(auto|manuell|vor-import)-(\d{4}-\d{2}-\d{2})(?:-(\d{2})(\d{2})(\d{2}))?/.exec(name);
  if (!m) return name;
  const kind = m[1] === "auto" ? "Automatisch" : m[1] === "manuell" ? "Download" : "Vor Import";
  return `${kind} · ${formatDate(m[2])}${m[3] ? ` ${m[3]}:${m[4]}` : ""}`;
}
