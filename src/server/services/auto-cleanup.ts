import "server-only";
import { db } from "../db";
import { deleteEmployee } from "./masterdata/employees";
import { deleteSite } from "./masterdata/sites";
import { deleteVehicle } from "./masterdata/vehicles";
import { getSettings } from "./settings";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CleanupResult = { sites: number; employees: number; vehicles: number; errors: string[] };

function cutoff(days: number, now: Date) {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Löscht deaktivierte Baustellen, Mitarbeiter und Fahrzeuge/Räume, deren
 * Deaktivierung länger als die eingestellte Anzahl Tage zurückliegt (0 = aus).
 */
export async function runAutoCleanup(now = new Date()): Promise<CleanupResult> {
  const s = await getSettings();
  const result: CleanupResult = { sites: 0, employees: 0, vehicles: 0, errors: [] };
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
  return result;
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
      for (const e of r.errors) console.warn(`[auto-cleanup] ${e}`);
    } catch (err) {
      console.error("[auto-cleanup] Fehler:", err);
    }
  };
  setTimeout(run, 60_000).unref();
  g.autoCleanupTimer = setInterval(run, 6 * 60 * 60 * 1000);
  g.autoCleanupTimer.unref();
}
