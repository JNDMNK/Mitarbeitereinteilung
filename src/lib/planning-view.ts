import { absenceOn, crewWarnings, siteWarnings, type Warning } from "./planning-logic";
import type { PAbsence, PAbsenceType, PAssignment, PEmployee, PlanningData, PSite, PVehicle, PVehicleDay } from "./planning-types";

export type AbsentEntry = { employee: PEmployee; absence: PAbsence; type: PAbsenceType | undefined };
export type OwnerInfo = {
  employee: PEmployee;
  /** here = sitzt in diesem Fahrzeug, elsewhere = auf anderem Fahrzeug, absent = abwesend, free = noch nicht eingeteilt */
  state: "here" | "elsewhere" | "absent" | "free";
  elsewhereVehicle?: PVehicle;
  absence?: AbsentEntry;
};
export type VehicleSlot = {
  vehicle: PVehicle;
  vehicleDay: PVehicleDay | null;
  crew: PEmployee[];
  crewWarnings: Warning[];
  /** Besitzer laut Stammdaten mit Tagesstatus */
  owner?: OwnerInfo;
  /** weitere Standard-Mitfahrer (Hinweis bei leerem Fahrzeug) */
  defaultMembers: PEmployee[];
  /** Fahrzeug nicht verfügbar: Besitzer ist mit ihm abwesend */
  unavailable?: AbsentEntry;
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
  poolEmployees: PoolEmployee[];
  /** employeeId -> vehicleId (wer sitzt wo) */
  seatOf: Map<string, string>;
  stats: { assigned: number; available: number; absent: number };
};

export function buildIndexes(data: PlanningData) {
  return {
    employees: new Map(data.employees.map((e) => [e.id, e])),
    vehicles: new Map(data.vehicles.map((v) => [v.id, v])),
    sites: new Map(data.sites.map((s) => [s.id, s])),
    departments: new Map(data.departments.map((d) => [d.id, d])),
    types: new Map(data.absenceTypes.map((t) => [t.id, t])),
    planners: new Map((data.planners ?? []).map((p) => [p.id, p])),
  };
}
export type Indexes = ReturnType<typeof buildIndexes>;

export function buildDay(data: PlanningData, idx: Indexes, date: string): DayView {
  const vds = data.vehicleDays.filter((v) => v.date === date);
  const absent: AbsentEntry[] = [];
  const absentIds = new Set<string>();
  for (const e of data.employees) {
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
    return { vehicle, vehicleDay: vd, crew, crewWarnings: crewWarnings(vehicle, crew, absentIds, vd.assignments.length > 0), defaultMembers: [] };
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
        slot.unavailable = abs;
        if (slot.crew.length > 0 || (slot.vehicleDay?.assignments.length ?? 0) > 0) {
          slot.crewWarnings = [{ level: "error", text: `Fahrzeug nicht verfügbar – mit ${ownerEmp.firstName} ${ownerEmp.lastName} abwesend` }, ...slot.crewWarnings];
        }
      }
    }
    slot.defaultMembers = v.defaultIds
      .filter((id) => id !== v.ownerId)
      .map((id) => idx.employees.get(id))
      .filter((e): e is PEmployee => !!e && e.active);
  };
  const poolOrder = () =>
    poolVehicles.sort(
      (a, b) =>
        Number(!!a.unavailable) - Number(!!b.unavailable) ||
        Number(b.crew.length > 0) - Number(a.crew.length > 0) ||
        a.vehicle.sortOrder - b.vehicle.sortOrder ||
        a.vehicle.name.localeCompare(b.vehicle.name),
    );
  for (const p of poolVehicles) annotate(p);
  poolOrder();

  for (const g of siteMap.values()) for (const it of g.items) annotate(it);
  const sites = [...siteMap.values()];
  for (const g of sites) g.items.sort((a, b) => a.assignment.startMin - b.assignment.startMin || a.vehicle.sortOrder - b.vehicle.sortOrder);
  sites.sort((a, b) => a.items[0].assignment.startMin - b.items[0].assignment.startMin || a.site.name.localeCompare(b.site.name));

  const depOrder = (e: PEmployee) => idx.departments.get(e.departmentId)?.sortOrder ?? 999;
  // Pool = nur verfügbare Mitarbeiter; Abwesende stehen ausschließlich in der Abwesenheitsleiste
  const poolEmployees: PoolEmployee[] = data.employees
    .filter((e) => e.active && !seatOf.has(e.id) && !absentIds.has(e.id))
    .sort((a, b) => depOrder(a) - depOrder(b) || a.lastName.localeCompare(b.lastName))
    .map((e) => ({ employee: e }));

  return {
    date,
    absent,
    sites,
    poolVehicles,
    poolEmployees,
    seatOf,
    stats: { assigned: seatOf.size, available: poolEmployees.length, absent: absent.length },
  };
}
