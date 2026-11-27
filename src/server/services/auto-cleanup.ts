import "server-only";
import { berlinDayStart, formatDate, todayIso } from "@/lib/dates";
import { audit } from "../audit";
import { db } from "../db";
import { deleteEmployee } from "./masterdata/employees";
import { deleteSite } from "./masterdata/sites";
import { deleteVehicle } from "./masterdata/vehicles";
import { getSettings } from "./settings";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CleanupResult = {
  sites: number;
  employees: number;
  vehicles: number;
  planningDays: number;
  absences: number;
  auditEntries: number;
  freeSites: number;
  vacuumed: boolean;
  errors: string[];
};

function cutoff(days: number, now: Date) {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Löscht deaktivierte Baustellen, Mitarbeiter und Fahrzeuge/Räume, deren
 * Deaktivierung länger als die eingestellte Anzahl Tage zurückliegt (0 = aus).
 */
export async function runAutoCleanup(now = new Date()): Promise<CleanupResult> {
  const s = await getSettings();
  const result: CleanupResult = { sites: 0, employees: 0, vehicles: 0, planningDays: 0, absences: 0, auditEntries: 0, freeSites: 0, vacuumed: false, errors: [] };
  const reason = (days: number) => `automatisch nach ${days} Tagen inaktiv`;

  if (s.autoDeleteSiteDays > 0) {
    const due = await db.site.findMany({ where: { active: false, deactivatedAt: { lte: cutoff(s.autoDeleteSiteDays, now) } }, select: { id: true, name: true } });
    for (const x of due) {
      try {
        await deleteSite({ id: null, role: "ADMIN" }, x.id, null, reason(s.autoDeleteSiteDays));
        result.sites++;
      } catch (err) {
        result.errors.push(`Baustelle „${x.name}“: ${(err as Error).message}`);
      }
    }
  }
  if (s.autoDeleteVehicleDays > 0) {
    const due = await db.vehicle.findMany({ where: { active: false, deactivatedAt: { lte: cutoff(s.autoDeleteVehicleDays, now) } }, select: { id: true, name: true } });
    for (const x of due) {
      try {
        await deleteVehicle(null, x.id, null, reason(s.autoDeleteVehicleDays));
        result.vehicles++;
      } catch (err) {
        result.errors.push(`Fahrzeug „${x.name}“: ${(err as Error).message}`);
      }
    }
  }
  if (s.autoDeleteEmployeeDays > 0) {
    const due = await db.employee.findMany({
      where: { active: false, deactivatedAt: { lte: cutoff(s.autoDeleteEmployeeDays, now) } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const x of due) {
      try {
        await deleteEmployee(null, x.id, null, reason(s.autoDeleteEmployeeDays));
        result.employees++;
      } catch (err) {
        result.errors.push(`Mitarbeiter ${x.firstName} ${x.lastName}: ${(err as Error).message}`);
      }
    }
  }
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      result.errors.push(`${label}: ${(err as Error).message}`);
    }
  };
  await step("Alte Planung", async () => {
    result.planningDays = await deleteOldPlanning(s.planningRetentionYears, now);
  });
  await step("Alte Abwesenheiten", async () => {
    result.absences = await deleteOldAbsences(s.absenceRetentionYears, now);
  });
  await step("Freie Einträge", async () => {
    result.freeSites = await deleteUnusedFreeSites(now);
  });
  await step("Änderungsprotokoll", async () => {
    result.auditEntries = await deleteOldAudit(s.auditRetentionYears, now);
  });
  return result;
}

const clampYears = (y: number) => Math.min(3, Math.max(1, y || 1));

/** Abwesenheiten, die vor dem Stichtag geendet haben, löschen */
async function deleteOldAbsences(years: number, now: Date): Promise<number> {
  const keepFrom = planningCutoff(clampYears(years), now);
  const res = await db.absence.deleteMany({ where: { endDate: { lt: keepFrom } } });
  if (res.count > 0) {
    await audit(db, {
      userId: null,
      action: "absence.cleanup",
      entityType: "Absence",
      entityId: keepFrom,
      summary: `Alte Abwesenheiten (Ende vor dem ${formatDate(keepFrom)}) automatisch gelöscht (nach ${years} Jahr(en)): ${res.count}`,
    });
  }
  return res.count;
}

/** Freie Einträge (Baustellen aus der Planung), die nirgends mehr eingeplant sind und seit 30 Tagen unverändert */
async function deleteUnusedFreeSites(now: Date): Promise<number> {
  const unused = await db.site.findMany({
    where: { adHoc: true, assignments: { none: {} }, updatedAt: { lt: cutoff(30, now) } },
    select: { id: true, name: true },
  });
  if (unused.length === 0) return 0;
  await db.$transaction(async (tx) => {
    await tx.site.deleteMany({ where: { id: { in: unused.map((x) => x.id) } } });
    await audit(tx, {
      userId: null,
      action: "site.cleanup",
      entityType: "Site",
      entityId: "adHoc",
      summary: `${unused.length} freie Einträge ohne Einsatz automatisch gelöscht: ${unused.slice(0, 10).map((x) => x.name).join(", ")}${unused.length > 10 ? " …" : ""}`,
    });
  });
  return unused.length;
}

/** Änderungsprotokoll vor dem Stichtag löschen (ein Eintrag über die Löschung bleibt) */
async function deleteOldAudit(years: number, now: Date): Promise<number> {
  const keepFrom = planningCutoff(clampYears(years), now);
  const res = await db.auditLog.deleteMany({ where: { createdAt: { lt: berlinDayStart(keepFrom) } } });
  if (res.count > 0) {
    await audit(db, {
      userId: null,
      action: "audit.cleanup",
      entityType: "AuditLog",
      entityId: keepFrom,
      summary: `Änderungsprotokoll vor dem ${formatDate(keepFrom)} automatisch gelöscht (nach ${years} Jahr(en)): ${res.count} Einträge`,
    });
  }
  return res.count;
}

const VACUUM_EVERY_DAYS = 30;

/** Datenbankdatei verdichten (VACUUM): höchstens alle 30 Tage, nur nachts (0–6 Uhr) */
export async function vacuumIfDue(now = new Date(), force = false): Promise<boolean> {
  if (!(process.env.DATABASE_URL ?? "file:").startsWith("file:")) return false;
  const hour = Number(new Intl.DateTimeFormat("de-DE", { hour: "2-digit", hour12: false, timeZone: "Europe/Berlin" }).format(now));
  const s = await getSettings();
  const due = !s.lastVacuumAt || now.getTime() - s.lastVacuumAt.getTime() > VACUUM_EVERY_DAYS * DAY_MS;
  // Fenster 0–5 Uhr (6 Stunden) – bei Prüfung alle 6 Stunden liegt immer ein Lauf darin
  if (!force && (!due || hour > 5)) return false;
  await db.$executeRawUnsafe("VACUUM");
  await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  await db.appSettings.update({ where: { id: 1 }, data: { lastVacuumAt: now } });
  return true;
}

/** Erster Tag, der noch aufbewahrt wird: heute vor `years` Jahren */
export function planningCutoff(years: number, now = new Date()): string {
  const today = todayIso(now);
  const y = Number(today.slice(0, 4)) - years;
  const md = today.slice(5) === "02-29" ? "02-28" : today.slice(5);
  return `${y}-${md}`;
}

/**
 * Planungstage (Fahrzeug-Tage mit Besatzung und Baustellen-Einsätzen) vor dem Stichtag löschen.
 * Stammdaten, Abwesenheiten und das Änderungsprotokoll bleiben unberührt.
 */
async function deleteOldPlanning(years: number, now: Date): Promise<number> {
  const keepFrom = planningCutoff(Math.min(3, Math.max(1, years || 1)), now);
  const where = { date: { lt: keepFrom } };
  const days = await db.vehicleDay.count({ where });
  if (days === 0) return 0;
  const assignments = await db.siteAssignment.count({ where: { vehicleDay: where } });
  await db.$transaction(async (tx) => {
    // Besatzung und Einsätze hängen per Cascade am Fahrzeug-Tag
    await tx.vehicleDay.deleteMany({ where });
    await audit(tx, {
      userId: null,
      action: "planning.cleanup",
      entityType: "Planning",
      entityId: keepFrom,
      summary: `Alte Planung vor dem ${formatDate(keepFrom)} automatisch gelöscht (nach ${years} Jahr(en)): ${days} Fahrzeug-Tage, ${assignments} Einsätze`,
    });
  });
  return days;
}

const g = globalThis as unknown as { autoCleanupTimer?: NodeJS.Timeout };

/** Beim Start nach 1 Minute, danach alle 6 Stunden prüfen. */
export function startAutoCleanup() {
  if (g.autoCleanupTimer) return;
  const run = async () => {
    try {
      const r = await runAutoCleanup();
      const total = r.sites + r.employees + r.vehicles;
      if (total > 0) console.log(`[auto-cleanup] gelöscht: ${r.sites} Baustelle(n), ${r.employees} Mitarbeiter, ${r.vehicles} Fahrzeug(e)/Raum/Räume`);
      if (r.planningDays || r.absences || r.auditEntries || r.freeSites) {
        console.log(`[auto-cleanup] alt gelöscht: ${r.planningDays} Fahrzeug-Tage, ${r.absences} Abwesenheiten, ${r.freeSites} freie Einträge, ${r.auditEntries} Protokolleinträge`);
      }
      if (await vacuumIfDue()) console.log("[auto-cleanup] Datenbank verdichtet (VACUUM)");
      for (const e of r.errors) console.warn(`[auto-cleanup] ${e}`);
    } catch (err) {
      console.error("[auto-cleanup] Fehler:", err);
    }
  };
  setTimeout(run, 60_000).unref();
  g.autoCleanupTimer = setInterval(run, 6 * 60 * 60 * 1000);
  g.autoCleanupTimer.unref();
}
