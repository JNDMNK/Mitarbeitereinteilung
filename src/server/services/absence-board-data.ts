import "server-only";
import { QUALIFICATIONS } from "@/lib/constants";
import { monthEnd, monthStart, todayIso } from "@/lib/dates";
import { db } from "../db";
import { listAbsencesInRange } from "./absences";
import { listOutages } from "./vehicle-outages";

export type AbsenceSearchParams = { monat?: string; abteilung?: string; ansicht?: string; gruppe?: string; quali?: string };

/** Daten für den Abwesenheitskalender (Planungsbereich und Monitor-Anzeige) */
export async function loadAbsenceBoard(sp: AbsenceSearchParams) {
  const today = todayIso();
  const month = sp.monat && /^\d{4}-\d{2}$/.test(sp.monat) ? `${sp.monat}-01` : monthStart(today);
  const from = monthStart(month);
  const to = monthEnd(month);

  const [absences, outages, vehicles, departments, types] = await Promise.all([
    listAbsencesInRange(from, to),
    listOutages(from, to),
    db.vehicle.findMany({
      where: { kind: "VEHICLE", active: true },
      select: { id: true, licensePlate: true, name: true, defaultDriverId: true, departmentId: true, defaultDriver: { select: { departmentId: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.department.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true, sortOrder: true } }),
    db.absenceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, color: true, active: true } }),
  ]);
  const withAbsence = new Set(absences.map((a) => a.employeeId));
  const owned = await db.vehicle.findMany({ where: { active: true, defaultDriverId: { not: null } }, select: { defaultDriverId: true, licensePlate: true } });
  const ownedVehicles: Record<string, string[]> = {};
  for (const v of owned) (ownedVehicles[v.defaultDriverId!] ??= []).push(v.licensePlate);
  const employees = await db.employee.findMany({
    // aktive Mitarbeiter + inaktive, die im Monat noch Abwesenheiten haben (Historie)
    // aktive Mitarbeiter, deren Zeitraum im Betrieb den Monat berührt, + Historie
    where: {
      OR: [
        {
          active: true,
          AND: [{ OR: [{ availableFrom: null }, { availableFrom: { lte: to } }] }, { OR: [{ availableUntil: null }, { availableUntil: { gte: from } }] }],
        },
        { id: { in: [...withAbsence] } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      shortName: true,
      active: true,
      availableFrom: true,
      availableUntil: true,
      qualification: true,
      department: { select: { id: true, name: true, color: true, sortOrder: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return {
    from,
    to,
    today,
    departmentFilter: sp.abteilung ?? "",
    qualiFilter: (sp.quali ?? "").split(",").filter((q) => (QUALIFICATIONS as readonly string[]).includes(q)),
    view: (sp.ansicht === "liste" ? "list" : "table") as "list" | "table",
    grouping: (sp.gruppe === "abteilung" ? "abteilung" : "quali") as "abteilung" | "quali",
    absences,
    departments,
    types,
    employees,
    ownedVehicles,
    outages,
    vehicles: vehicles.map((v) => ({
      id: v.id,
      licensePlate: v.licensePlate,
      name: v.name,
      ownerId: v.defaultDriverId,
      departmentId: v.departmentId ?? v.defaultDriver?.departmentId ?? null,
    })),
  };
}
