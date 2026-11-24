import { DUE_WARN_DAYS, isAvailableOn, OUTAGE_ICON, outageLabel } from "./constants";
import { diffDays, formatDayShort } from "./dates";
import { compactNames } from "./names";
import { absenceOn, crewWarnings, siteWarnings, type Warning } from "./planning-logic";
import type { PAbsence, PAbsenceType, PAssignment, PEmployee, PlanningData, POutage, PSite, PVehicle, PVehicleDay } from "./planning-types";

export type AbsentEntry = { employee: PEmployee; absence: PAbsence; type: PAbsenceType | undefined };
export type OwnerInfo = {
  employee: PEmployee;
  /** here = sitzt in diesem Fahrzeug, elsewhere = auf anderem Fahrzeug, absent = abwesend, free = noch nicht eingeteilt */
  state: "here" | "elsewhere" | "absent" | "free";
  elsewhereVehicle?: PVehicle;
  absence?: AbsentEntry;
};
/** Fahrzeug an diesem Tag nicht verfügbar */
export type Unavailable = {
  /** z. B. "🔧 Werkstatt bis Do, 03.12. (Bremsen)" bzw. "mit Max Müller abwesend (Urlaub)" */
  text: string;
  /** z. B. "Werkstatt" bzw. "mit MMU abwesend" */
  short: string;
  outage?: POutage;
  absence?: AbsentEntry;
};
/** Fälligkeit (TÜV/Service) in Kürze oder überfällig */
export type DueNote = { label: string; date: string; overdue: boolean };

export type VehicleSlot = {
  vehicle: PVehicle;
  vehicleDay: PVehicleDay | null;
  crew: PEmployee[];
  crewWarnings: Warning[];
  /** Besitzer laut Stammdaten mit Tagesstatus */
  owner?: OwnerInfo;
  /** weitere Standard-Mitfahrer (Hinweis bei leerem Fahrzeug) */
  defaultMembers: PEmployee[];
  /** Fahrzeug nicht verfügbar: Ausfall (Werkstatt …) oder Besitzer ist mit ihm abwesend */
  unavailable?: Unavailable;
  /** TÜV/Service bald fällig */
  due?: DueNote[];
};
export type AssignmentItem = VehicleSlot & { assignment: PAssignment; vehicleDay: PVehicleDay };
export type SiteGroup = { site: PSite; items: AssignmentItem[]; warnings: Warning[] };
export type PoolEmployee = { employee: PEmployee; absence?: AbsentEntry };

export type DayView = {
  date: string;
  absent: AbsentEntry[];
  sites: SiteGroup[];
  /** Fahrzeuge ohne Baustelleneinsatz (mit oder ohne Besatzung) */
  poolVehicles: VehicleSlot[];
  /** Räume (Lager, Schulungsraum …) – ganztägig, ohne Baustelle */
  rooms: VehicleSlot[];
  poolEmployees: PoolEmployee[];
  /** employeeId -> vehicleId (wer sitzt wo) */
  seatOf: Map<string, string>;
  stats: { assigned: number; available: number; absent: number };
  /** ausgeblendete Abteilungen und was dadurch verborgen ist */
  hidden?: { departments: Set<string>; employees: number; vehicles: number };
};

export function buildIndexes(data: PlanningData) {
  return {
    employees: new Map(data.employees.map((e) => [e.id, e])),
    vehicles: new Map(data.vehicles.map((v) => [v.id, v])),
    sites: new Map(data.sites.map((s) => [s.id, s])),
    departments: new Map(data.departments.map((d) => [d.id, d])),
    types: new Map(data.absenceTypes.map((t) => [t.id, t])),
    planners: new Map((data.planners ?? []).map((p) => [p.id, p])),
    /** "Müller M." – kompakte, eindeutige Anzeigenamen */
    names: compactNames(data.employees),
  };
}
export type Indexes = ReturnType<typeof buildIndexes>;

export function buildDay(data: PlanningData, idx: Indexes, date: string): DayView {
  const vds = data.vehicleDays.filter((v) => v.date === date);
  const absent: AbsentEntry[] = [];
  const absentIds = new Set<string>();
  for (const e of data.employees) {
    if (!isAvailableOn(e, date)) continue;
    const a = absenceOn(data.absences, e.id, date);
    if (a) {
      absent.push({ employee: e, absence: a, type: idx.types.get(a.typeId) });
      absentIds.add(e.id);
    }
  }

  const seatOf = new Map<string, string>();
  const slotOf = (vd: PVehicleDay): VehicleSlot | null => {
    const vehicle = idx.vehicles.get(vd.vehicleId);
    if (!vehicle) return null;
    const crew = vd.crew.map((c) => idx.employees.get(c.employeeId)).filter((e): e is PEmployee => !!e);
    for (const e of crew) seatOf.set(e.id, vehicle.id);
    const outside: Warning[] = crew
      .filter((e) => !isAvailableOn(e, date))
      .map((e) => ({ level: "error", text: `${e.firstName} ${e.lastName} ist an diesem Tag nicht im Betrieb` }));
    // Räume: kein "nur Azubis"/"keine Besatzung" (ein Lehrling allein im Lager ist gewollt)
    const base = crewWarnings(vehicle, crew, absentIds, vd.assignments.length > 0).filter(
      (w) => vehicle.kind !== "ROOM" || (!w.text.startsWith("Nur Azubis") && w.text !== "Keine Besatzung"),
    );
    return { vehicle, vehicleDay: vd, crew, crewWarnings: [...outside, ...base], defaultMembers: [] };
  };

  const siteMap = new Map<string, SiteGroup>();
  const poolVehicles: VehicleSlot[] = [];
  const usedVehicles = new Set<string>();
  for (const vd of vds) {
    const slot = slotOf(vd);
    if (!slot) continue;
    usedVehicles.add(vd.vehicleId);
    if (vd.assignments.length === 0) {
      poolVehicles.push(slot);
      continue;
    }
    for (const a of vd.assignments) {
      const site = idx.sites.get(a.siteId);
      if (!site) continue;
      const g = siteMap.get(site.id) ?? { site, items: [], warnings: siteWarnings(site, date) };
      g.items.push({ ...slot, vehicleDay: vd, assignment: a });
      siteMap.set(site.id, g);
    }
  }
  // freie Fahrzeuge ohne Fahrzeug-Tag
  for (const v of data.vehicles) {
    if (v.active && !usedVehicles.has(v.id)) poolVehicles.push({ vehicle: v, vehicleDay: null, crew: [], crewWarnings: [], defaultMembers: [] });
  }

  // Besitzer, Standard-Mitfahrer und Verfügbarkeit ergänzen (braucht vollständiges seatOf)
  const annotate = (slot: VehicleSlot) => {
    const v = slot.vehicle;
    const ownerEmp = v.ownerId ? idx.employees.get(v.ownerId) : undefined;
    if (ownerEmp) {
      const abs = absent.find((a) => a.employee.id === ownerEmp.id);
      const seat = seatOf.get(ownerEmp.id);
      slot.owner = {
        employee: ownerEmp,
        state: seat === v.id ? "here" : seat ? "elsewhere" : abs ? "absent" : "free",
        elsewhereVehicle: seat && seat !== v.id ? idx.vehicles.get(seat) : undefined,
        absence: abs,
      };
      if (abs?.absence.withVehicle) {
        slot.unavailable = {
          text: `mit ${ownerEmp.firstName} ${ownerEmp.lastName} abwesend (${abs.type?.name ?? "Abwesenheit"})`,
          short: `mit ${ownerEmp.shortName} abwesend`,
          absence: abs,
        };
      }
    }
    const outage = (data.outages ?? []).find((o) => o.vehicleId === v.id && o.startDate <= date && o.endDate >= date);
    if (outage) {
      const label = outageLabel(outage.reason);
      slot.unavailable = { text: `${OUTAGE_ICON} ${label} bis ${formatDayShort(outage.endDate)}${outage.note ? ` (${outage.note})` : ""}`, short: label, outage };
    }
    if (slot.unavailable && (slot.crew.length > 0 || (slot.vehicleDay?.assignments.length ?? 0) > 0)) {
      slot.crewWarnings = [{ level: "error", text: `Fahrzeug nicht verfügbar – ${slot.unavailable.text}` }, ...slot.crewWarnings];
    }
    const due: DueNote[] = [];
    for (const [label, d] of [["TÜV", v.tuevDue], ["Service", v.serviceDue]] as const) {
      if (d && diffDays(date, d) <= DUE_WARN_DAYS) due.push({ label, date: d, overdue: d < date });
    }
    if (due.length) slot.due = due;
    slot.defaultMembers = v.defaultIds
      .filter((id) => id !== v.ownerId)
      .map((id) => idx.employees.get(id))
      .filter((e): e is PEmployee => !!e && e.active && isAvailableOn(e, date));
  };
  const poolOrder = () =>
    poolVehicles.sort(
      (a, b) =>
        Number(!!a.unavailable) - Number(!!b.unavailable) ||
        a.vehicle.sortOrder - b.vehicle.sortOrder ||
        a.vehicle.name.localeCompare(b.vehicle.name),
    );
  for (const p of poolVehicles) annotate(p);
  poolOrder();
  const rooms = poolVehicles.filter((p) => p.vehicle.kind === "ROOM");
  const vehiclesOnly = poolVehicles.filter((p) => p.vehicle.kind !== "ROOM");

  for (const g of siteMap.values()) for (const it of g.items) annotate(it);
  const sites = [...siteMap.values()];
  // Fahrzeug-Reihenfolge laut Stammdaten auch in der Kartenansicht:
  // innerhalb der Baustelle nach Fahrzeug (dann Uhrzeit), Baustellen nach ihrem ersten Fahrzeug
  const vehicleOrder = (v: PVehicle) => [v.sortOrder, v.name] as const;
  for (const g of sites) {
    g.items.sort(
      (a, b) => vehicleOrder(a.vehicle)[0] - vehicleOrder(b.vehicle)[0] || a.vehicle.name.localeCompare(b.vehicle.name) || a.assignment.startMin - b.assignment.startMin,
    );
  }
  sites.sort(
    (a, b) =>
      a.items[0].vehicle.sortOrder - b.items[0].vehicle.sortOrder ||
      a.items[0].vehicle.name.localeCompare(b.items[0].vehicle.name) ||
      a.items[0].assignment.startMin - b.items[0].assignment.startMin ||
      a.site.name.localeCompare(b.site.name),
  );

  const depOrder = (e: PEmployee) => idx.departments.get(e.departmentId)?.sortOrder ?? 999;
  // Pool = nur verfügbare Mitarbeiter; Abwesende stehen ausschließlich in der Abwesenheitsleiste
  const poolEmployees: PoolEmployee[] = data.employees
    .filter((e) => e.active && !seatOf.has(e.id) && !absentIds.has(e.id) && isAvailableOn(e, date))
    .sort((a, b) => depOrder(a) - depOrder(b) || a.lastName.localeCompare(b.lastName))
    .map((e) => ({ employee: e }));

  return {
    date,
    absent,
    sites,
    poolVehicles: vehiclesOnly,
    rooms,
    poolEmployees,
    seatOf,
    stats: { assigned: seatOf.size, available: poolEmployees.length, absent: absent.length },
  };
}

/** Abteilung eines Fahrzeugs: eigene laut Stammdaten, sonst die des Besitzers (null = keine) */
export function vehicleDepartment(idx: Indexes, v: PVehicle): string | null {
  if (v.departmentId) return v.departmentId;
  return v.ownerId ? (idx.employees.get(v.ownerId)?.departmentId ?? null) : null;
}

/**
 * Abteilungen ausblenden: Mitarbeiter und Fahrzeuge dieser Abteilungen verschwinden.
 * Ein Fahrzeug bleibt sichtbar, wenn jemand aus einer sichtbaren Abteilung darin sitzt.
 * Fahrzeuge ohne Abteilung werden nie ausgeblendet.
 */
export function filterDayByDepartments(day: DayView, idx: Indexes, hiddenDepartments: Set<string>): DayView {
  if (hiddenDepartments.size === 0) return day;
  const empHidden = (e: PEmployee) => hiddenDepartments.has(e.departmentId);
  const slotVisible = (slot: VehicleSlot) => {
    const dep = vehicleDepartment(idx, slot.vehicle);
    if (!dep || !hiddenDepartments.has(dep)) return true;
    return slot.crew.some((e) => !empHidden(e));
  };

  const sites = day.sites.map((g) => ({ ...g, items: g.items.filter(slotVisible) })).filter((g) => g.items.length > 0);
  const poolVehicles = day.poolVehicles.filter(slotVisible);
  const rooms = day.rooms.filter(slotVisible);
  const poolEmployees = day.poolEmployees.filter((p) => !empHidden(p.employee));
  const absent = day.absent.filter((a) => !empHidden(a.employee));

  const visibleVehicleIds = new Set([...poolVehicles, ...rooms].map((p) => p.vehicle.id).concat(sites.flatMap((g) => g.items.map((i) => i.vehicle.id))));
  const allVehicleIds = new Set([...day.poolVehicles, ...day.rooms].map((p) => p.vehicle.id).concat(day.sites.flatMap((g) => g.items.map((i) => i.vehicle.id))));
  const assigned = new Set([
    ...sites.flatMap((g) => g.items.flatMap((i) => i.crew.map((e) => e.id))),
    ...[...poolVehicles, ...rooms].flatMap((p) => p.crew.map((e) => e.id)),
  ]);

  return {
    ...day,
    sites,
    poolVehicles,
    rooms,
    poolEmployees,
    absent,
    stats: { assigned: assigned.size, available: poolEmployees.length, absent: absent.length },
    hidden: {
      departments: hiddenDepartments,
      employees: day.poolEmployees.length - poolEmployees.length + (day.absent.length - absent.length),
      vehicles: allVehicleIds.size - visibleVehicleIds.size,
    },
  };
}
