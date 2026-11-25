// Aufbereitung für die Monitor-Anzeige: nur lesbare, serialisierbare Daten (keine Maps).
import { groupByQualification, QUALIFICATION_BADGES, type Qualification } from "./constants";
import { formatDayShort, isoWeek } from "./dates";
import { holidayName } from "./holidays";
import { fixedLabel, timeRange } from "./planning-logic";
import type { PEmployee, PlanningData } from "./planning-types";
import { buildDay, buildIndexes, type VehicleSlot } from "./planning-view";

export type DPerson = { id: string; name: string; badge: string; quali: string; color: string };
export type DVehicle = { id: string; plate: string; name: string; isRoom: boolean; time?: string; note?: string | null; fixed?: string | null; fixedNote?: string | null; crew: DPerson[]; warning?: string };
export type DSite = { id: string; name: string; orderNumber: string | null; address: string | null; color: string; vehicles: DVehicle[] };
export type DDay = {
  date: string;
  short: string;
  long: string;
  kw: number;
  isToday: boolean;
  holiday: string | null;
  stats: { assigned: number; available: number; absent: number };
  absent: (DPerson & { code: string; typeColor: string; typeName: string })[];
  sites: DSite[];
  /** Fahrzeuge mit Besatzung, aber ohne Baustelle */
  idleVehicles: DVehicle[];
  rooms: DVehicle[];
  unavailable: { plate: string; name: string; text: string }[];
  /** freie Mitarbeiter, nach Qualifikation gruppiert */
  free: { label: string; people: DPerson[] }[];
};

export function buildDisplayDays(data: PlanningData, days: string[], today: string): DDay[] {
  const idx = buildIndexes(data);
  const person = (e: PEmployee): DPerson => ({
    id: e.id,
    name: idx.names.get(e.id) ?? e.shortName,
    badge: QUALIFICATION_BADGES[e.qualification as Qualification] ?? "",
    quali: e.qualification,
    color: idx.departments.get(e.departmentId)?.color ?? "#94a3b8",
  });
  const vehicle = (s: VehicleSlot, time?: string, note?: string | null): DVehicle => ({
    id: s.vehicle.id,
    plate: s.vehicle.licensePlate,
    name: s.vehicle.name,
    isRoom: s.vehicle.kind === "ROOM",
    time,
    note,
    crew: s.crew.map(person),
    warning: s.crewWarnings.find((w) => w.level === "error")?.text,
  });

  return days.map((date) => {
    const day = buildDay(data, idx, date);
    return {
      date,
      short: formatDayShort(date),
      long: `${["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][new Date(`${date}T12:00:00Z`).getUTCDay()]}, ${date.slice(8, 10)}.${date.slice(5, 7)}.`,
      kw: isoWeek(date),
      isToday: date === today,
      holiday: holidayName(date),
      stats: day.stats,
      absent: day.absent.map((a) => ({
        ...person(a.employee),
        code: a.type?.code ?? "?",
        typeColor: a.type?.color ?? "#64748b",
        typeName: a.type?.name ?? "Abwesend",
      })),
      sites: day.sites.map((g) => ({
        id: g.site.id,
        name: g.site.name,
        orderNumber: g.site.orderNumber,
        address: g.site.address,
        color: g.site.color,
        vehicles: g.items.map((it) => ({
          ...vehicle(it, timeRange(it.assignment.startMin, it.assignment.endMin), it.assignment.note),
          fixed: fixedLabel(it.assignment),
          fixedNote: it.assignment.fixed ? it.assignment.fixedNote : null,
        })),
      })),
      idleVehicles: day.poolVehicles.filter((p) => p.crew.length > 0 && !p.unavailable).map((p) => vehicle(p)),
      rooms: day.rooms.filter((r) => r.crew.length > 0).map((r) => vehicle(r)),
      unavailable: day.poolVehicles.filter((p) => p.unavailable).map((p) => ({ plate: p.vehicle.licensePlate, name: p.vehicle.name, text: p.unavailable!.text })),
      free: groupByQualification(day.poolEmployees, (p) => p.employee.qualification).map((g) => ({ label: g.label, people: g.items.map((p) => person(p.employee)) })),
    };
  });
}
