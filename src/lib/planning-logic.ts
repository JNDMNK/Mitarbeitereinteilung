import { isUnqualified } from "./constants";
import { formatDate } from "./dates";
import { DAY_MINUTES, formatMinutes, overlaps, SLOT_MINUTES } from "./time";
import type { PAbsence, PEmployee, PSite, PVehicle } from "./planning-types";

export type Warning = { level: "error" | "warn"; text: string };

/** Abwesenheit eines Mitarbeiters an einem Tag (oder undefined) */
export function absenceOn<T extends Pick<PAbsence, "employeeId" | "startDate" | "endDate">>(absences: T[], employeeId: string, date: string): T | undefined {
  return absences.find((a) => a.employeeId === employeeId && a.startDate <= date && a.endDate >= date);
}

/** Warnungen zur Besatzung eines Fahrzeugs an einem Tag */
export function crewWarnings(
  vehicle: Pick<PVehicle, "seats">,
  crew: Pick<PEmployee, "id" | "firstName" | "lastName" | "qualification">[],
  absentIds: Set<string>,
  hasAssignment: boolean,
): Warning[] {
  const w: Warning[] = [];
  for (const e of crew) {
    if (absentIds.has(e.id)) w.push({ level: "error", text: `${e.firstName} ${e.lastName} ist abwesend` });
  }
  if (crew.length > vehicle.seats) w.push({ level: "error", text: `Überbelegt: ${crew.length} Personen bei ${vehicle.seats} Sitzplätzen` });
  if (crew.length > 0 && crew.every((e) => isUnqualified(e.qualification))) {
    const label = crew.some((e) => e.qualification === "PRAKTIKANT") ? "Nur Azubis/Praktikanten" : "Nur Azubis";
    w.push({ level: "warn", text: `${label} – kein Geselle/Meister` });
  }
  if (crew.length === 0 && hasAssignment) w.push({ level: "warn", text: "Keine Besatzung" });
  return w;
}

/** Warnungen zur Baustelle an einem Tag */
export function siteWarnings(site: Pick<PSite, "startDate" | "endDate" | "status" | "active">, date: string): Warning[] {
  const w: Warning[] = [];
  if (site.startDate && date < site.startDate) w.push({ level: "warn", text: `Baustelle beginnt erst am ${formatDate(site.startDate)}` });
  if (site.endDate && date > site.endDate) w.push({ level: "warn", text: `Baustelle endete am ${formatDate(site.endDate)}` });
  if (site.status === "DONE") w.push({ level: "warn", text: "Baustelle ist abgeschlossen" });
  if (!site.active) w.push({ level: "warn", text: "Baustelle ist deaktiviert" });
  return w;
}

/** Erstes Intervall, das [start, end) schneidet */
export function findOverlap<T extends { startMin: number; endMin: number }>(list: T[], start: number, end: number): T | undefined {
  return list.find((a) => overlaps(a.startMin, a.endMin, start, end));
}

/**
 * Zeitvorschlag für einen neuen Einsatz: Standard-Arbeitszeit, falls frei,
 * sonst das nächste freie Zeitfenster. null, wenn der Tag voll ist.
 */
export function suggestSlot(
  existing: { startMin: number; endMin: number }[],
  defaultStart: number,
  defaultEnd: number,
): { startMin: number; endMin: number } | null {
  if (!findOverlap(existing, defaultStart, defaultEnd)) return { startMin: defaultStart, endMin: defaultEnd };
  const sorted = [...existing].sort((a, b) => a.startMin - b.startMin);
  // Kandidaten: Standardbeginn und jedes Einsatzende
  const candidates = [defaultStart, ...sorted.map((a) => a.endMin)].filter((c) => c < DAY_MINUTES).sort((a, b) => a - b);
  for (const start of candidates) {
    if (findOverlap(sorted, start, start + SLOT_MINUTES)) continue;
    const next = sorted.find((a) => a.startMin >= start + SLOT_MINUTES);
    const wanted = Math.max(defaultEnd, start + 60);
    const end = Math.min(next ? next.startMin : DAY_MINUTES, wanted, DAY_MINUTES);
    if (end > start) return { startMin: start, endMin: end };
  }
  // Lücke vor dem Standardbeginn?
  const first = sorted[0];
  if (first && first.startMin >= SLOT_MINUTES) {
    return { startMin: Math.max(0, first.startMin - 4 * 60), endMin: first.startMin };
  }
  return null;
}

export function timeRange(startMin: number, endMin: number): string {
  return `${formatMinutes(startMin)}–${formatMinutes(endMin)}`;
}
