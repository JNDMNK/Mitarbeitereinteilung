import "server-only";
import type { z } from "zod";
import { formatDayShort } from "@/lib/dates";
import { absenceOn, findOverlap, siteWarnings, timeRange } from "@/lib/planning-logic";
import type {
  assignmentCreateSchema,
  assignmentDeleteSchema,
  assignmentUpdateSchema,
  crewAssignSchema,
  crewRemoveSchema,
  vehicleReleaseSchema,
} from "@/lib/planning-schemas";
import type { PlanningData, PlanningResult } from "@/lib/planning-types";
import { audit } from "../audit";
import { db, type Tx } from "../db";
import { ApiError, badRequest, conflict, notFound } from "../errors";
import { publishChange } from "../events";

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export async function getPlanningData(from: string, to: string): Promise<PlanningData> {
  const [vehicleDays, absences, departments, absenceTypes, settings] = await Promise.all([
    db.vehicleDay.findMany({
      where: { date: { gte: from, lte: to } },
      select: {
        id: true,
        date: true,
        vehicleId: true,
        note: true,
        version: true,
        crew: { select: { id: true, employeeId: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        assignments: { select: { id: true, siteId: true, startMin: true, endMin: true, note: true, version: true }, orderBy: { startMin: "asc" } },
      },
    }),
    db.absence.findMany({
      where: { startDate: { lte: to }, endDate: { gte: from } },
      select: { id: true, employeeId: true, typeId: true, startDate: true, endDate: true, note: true },
    }),
    db.department.findMany({ select: { id: true, name: true, color: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.absenceType.findMany({ select: { id: true, name: true, code: true, color: true }, orderBy: { sortOrder: "asc" } }),
    db.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);

  const usedEmployees = new Set(vehicleDays.flatMap((v) => v.crew.map((c) => c.employeeId)));
  const usedVehicles = new Set(vehicleDays.map((v) => v.vehicleId));
  const usedSites = new Set(vehicleDays.flatMap((v) => v.assignments.map((a) => a.siteId)));

  const [employees, vehicles, sites] = await Promise.all([
    db.employee.findMany({
      where: { OR: [{ active: true }, { id: { in: [...usedEmployees] } }] },
      select: { id: true, firstName: true, lastName: true, shortName: true, qualification: true, departmentId: true, phone: true, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    db.vehicle.findMany({
      where: { OR: [{ active: true }, { id: { in: [...usedVehicles] } }] },
      select: {
        id: true,
        licensePlate: true,
        name: true,
        type: true,
        seats: true,
        active: true,
        sortOrder: true,
        defaultDriverId: true,
        defaultMembers: { select: { employeeId: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.site.findMany({
      where: { OR: [{ active: true, status: { not: "DONE" } }, { id: { in: [...usedSites] } }] },
      select: { id: true, name: true, address: true, customer: true, orderNumber: true, startDate: true, endDate: true, status: true, note: true, color: true, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    from,
    to,
    employees,
    vehicles: vehicles.map(({ defaultDriverId, defaultMembers, ...v }) => ({
      ...v,
      defaultIds: [...(defaultDriverId ? [defaultDriverId] : []), ...defaultMembers.map((m) => m.employeeId)],
    })),
    sites,
    departments,
    absenceTypes,
    absences,
    vehicleDays,
    settings: { defaultStartMin: settings.defaultStartMin, defaultEndMin: settings.defaultEndMin },
  };
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

async function loadVehicle(tx: Tx, vehicleId: string) {
  const v = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    include: { defaultMembers: { orderBy: { sortOrder: "asc" } } },
  });
  if (!v) throw notFound("Fahrzeug nicht gefunden.");
  return v;
}

async function loadEmployee(tx: Tx, employeeId: string) {
  const e = await tx.employee.findUnique({ where: { id: employeeId } });
  if (!e) throw notFound("Mitarbeiter nicht gefunden.");
  return e;
}

async function absentOn(tx: Tx, employeeId: string, date: string) {
  return tx.absence.findFirst({ where: { employeeId, startDate: { lte: date }, endDate: { gte: date } }, include: { type: true } });
}

/**
 * Fahrzeug-Tag holen oder anlegen. Beim Anlegen wird die Standard-Besatzung
 * vorbelegt – außer abwesende, inaktive oder anderweitig eingeteilte Mitarbeiter.
 */
async function ensureVehicleDay(tx: Tx, date: string, vehicleId: string, messages: string[]) {
  const existing = await tx.vehicleDay.findUnique({ where: { date_vehicleId: { date, vehicleId } } });
  if (existing) return existing;

  const vehicle = await loadVehicle(tx, vehicleId);
  if (!vehicle.active) throw badRequest(`Fahrzeug ${vehicle.licensePlate} ist deaktiviert.`);
  const vd = await tx.vehicleDay.create({ data: { date, vehicleId } });

  const defaults = [...(vehicle.defaultDriverId ? [vehicle.defaultDriverId] : []), ...vehicle.defaultMembers.map((m) => m.employeeId)];
  if (defaults.length === 0) return vd;

  const [emps, taken, absences] = await Promise.all([
    tx.employee.findMany({ where: { id: { in: defaults } } }),
    tx.crewMember.findMany({ where: { date, employeeId: { in: defaults } }, include: { vehicleDay: { include: { vehicle: true } } } }),
    tx.absence.findMany({ where: { employeeId: { in: defaults }, startDate: { lte: date }, endDate: { gte: date } }, include: { type: true } }),
  ]);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const empId of defaults) {
    const e = emps.find((x) => x.id === empId);
    if (!e) continue;
    const abs = absences.find((a) => a.employeeId === empId);
    const busy = taken.find((t) => t.employeeId === empId);
    if (!e.active) skipped.push(`${e.shortName} (inaktiv)`);
    else if (abs) skipped.push(`${e.shortName} (${abs.type.name})`);
    else if (busy) skipped.push(`${e.shortName} (schon auf ${busy.vehicleDay.vehicle.licensePlate})`);
    else if (added.length >= vehicle.seats) skipped.push(`${e.shortName} (kein Sitzplatz frei)`);
    else {
      await tx.crewMember.create({ data: { vehicleDayId: vd.id, date, employeeId: empId, sortOrder: added.length } });
      added.push(e.shortName);
    }
  }
  if (added.length) messages.push(`Standard-Besatzung von ${vehicle.licensePlate} vorbelegt: ${added.join(", ")}.`);
  if (skipped.length) messages.push(`Nicht vorbelegt: ${skipped.join(", ")}.`);
  return vd;
}

/** Leeren Fahrzeug-Tag (keine Besatzung, kein Einsatz) entfernen */
async function cleanupVehicleDay(tx: Tx, vehicleDayId: string) {
  const vd = await tx.vehicleDay.findUnique({ where: { id: vehicleDayId }, include: { _count: { select: { crew: true, assignments: true } } } });
  if (vd && vd._count.crew === 0 && vd._count.assignments === 0) await tx.vehicleDay.delete({ where: { id: vehicleDayId } });
}

async function bumpVehicleDay(tx: Tx, vehicleDayId: string) {
  await tx.vehicleDay.update({ where: { id: vehicleDayId }, data: { version: { increment: 1 } } });
}

function finish(userId: string, dates: string[], messages: string[], warnings: string[]): PlanningResult {
  publishChange({ scope: "planning", dates: [...new Set(dates)], userId });
  return { ok: true, messages, warnings };
}

// ---------------------------------------------------------------------------
// Besatzung
// ---------------------------------------------------------------------------

export async function assignCrew(actorId: string, input: z.infer<typeof crewAssignSchema>): Promise<PlanningResult> {
  const messages: string[] = [];
  const warnings: string[] = [];
  await db.$transaction(async (tx) => {
    const emp = await loadEmployee(tx, input.employeeId);
    if (!emp.active) throw badRequest(`${fullName(emp)} ist deaktiviert.`);
    const vehicle = await loadVehicle(tx, input.vehicleId);

    const current = await tx.crewMember.findUnique({
      where: { date_employeeId: { date: input.date, employeeId: input.employeeId } },
      include: { vehicleDay: { include: { vehicle: true } } },
    });
    const currentVehicleId = current?.vehicleDay.vehicleId ?? null;
    if (currentVehicleId !== input.expectedFromVehicleId) {
      throw conflict(
        current
          ? `${fullName(emp)} wurde inzwischen auf ${current.vehicleDay.vehicle.licensePlate} eingeteilt. Die Ansicht wird aktualisiert.`
          : `${fullName(emp)} ist inzwischen nicht mehr eingeteilt. Die Ansicht wird aktualisiert.`,
      );
    }
    if (currentVehicleId === input.vehicleId) return; // nichts zu tun

    if (current) {
      await tx.crewMember.delete({ where: { id: current.id } });
      await bumpVehicleDay(tx, current.vehicleDayId);
      await cleanupVehicleDay(tx, current.vehicleDayId);
    }
    const vd = await ensureVehicleDay(tx, input.date, input.vehicleId, messages);
    const already = await tx.crewMember.findUnique({ where: { date_employeeId: { date: input.date, employeeId: input.employeeId } } });
    if (!already) {
      const count = await tx.crewMember.count({ where: { vehicleDayId: vd.id } });
      await tx.crewMember.create({ data: { vehicleDayId: vd.id, date: input.date, employeeId: input.employeeId, sortOrder: count } });
    }
    await bumpVehicleDay(tx, vd.id);

    const crewCount = await tx.crewMember.count({ where: { vehicleDayId: vd.id } });
    if (crewCount > vehicle.seats) warnings.push(`${vehicle.licensePlate} ist überbelegt (${crewCount}/${vehicle.seats}).`);
    const abs = await absentOn(tx, emp.id, input.date);
    if (abs) warnings.push(`${fullName(emp)} ist am ${formatDayShort(input.date)} abwesend (${abs.type.name}).`);

    await audit(tx, {
      userId: actorId,
      action: current ? "crew.move" : "crew.assign",
      entityType: "CrewMember",
      entityId: emp.id,
      date: input.date,
      summary: current
        ? `${fullName(emp)} von ${current.vehicleDay.vehicle.licensePlate} nach ${vehicle.licensePlate} verschoben (${formatDayShort(input.date)})`
        : `${fullName(emp)} auf ${vehicle.licensePlate} eingeteilt (${formatDayShort(input.date)})`,
    });
  });
  return finish(actorId, [input.date], messages, warnings);
}

export async function removeCrew(actorId: string, input: z.infer<typeof crewRemoveSchema>): Promise<PlanningResult> {
  await db.$transaction(async (tx) => {
    const emp = await loadEmployee(tx, input.employeeId);
    const current = await tx.crewMember.findUnique({
      where: { date_employeeId: { date: input.date, employeeId: input.employeeId } },
      include: { vehicleDay: { include: { vehicle: true } } },
    });
    if (!current || current.vehicleDay.vehicleId !== input.expectedFromVehicleId) {
      throw conflict(`${fullName(emp)} wurde inzwischen umgeplant. Die Ansicht wird aktualisiert.`);
    }
    await tx.crewMember.delete({ where: { id: current.id } });
    await bumpVehicleDay(tx, current.vehicleDayId);
    await cleanupVehicleDay(tx, current.vehicleDayId);
    await audit(tx, {
      userId: actorId,
      action: "crew.remove",
      entityType: "CrewMember",
      entityId: emp.id,
      date: input.date,
      summary: `${fullName(emp)} von ${current.vehicleDay.vehicle.licensePlate} entfernt (${formatDayShort(input.date)})`,
    });
  });
  return finish(actorId, [input.date], [], []);
}

// ---------------------------------------------------------------------------
// Baustelleneinsätze
// ---------------------------------------------------------------------------

async function assertNoOverlap(tx: Tx, vehicleDayId: string, start: number, end: number, exceptId?: string) {
  const others = await tx.siteAssignment.findMany({
    where: { vehicleDayId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    include: { site: true },
  });
  const clash = findOverlap(others, start, end);
  if (clash) {
    throw new ApiError(409, `Überschneidet sich mit dem Einsatz ${timeRange(clash.startMin, clash.endMin)} auf „${clash.site.name}“.`, "overlap");
  }
}

export async function createAssignment(actorId: string, input: z.infer<typeof assignmentCreateSchema>): Promise<PlanningResult> {
  const messages: string[] = [];
  const warnings: string[] = [];
  await db.$transaction(async (tx) => {
    const site = await tx.site.findUnique({ where: { id: input.siteId } });
    if (!site || !site.active) throw badRequest("Bitte eine aktive Baustelle wählen.");
    const vehicle = await loadVehicle(tx, input.vehicleId);
    const vd = await ensureVehicleDay(tx, input.date, input.vehicleId, messages);
    await assertNoOverlap(tx, vd.id, input.startMin, input.endMin);
    await tx.siteAssignment.create({
      data: { vehicleDayId: vd.id, siteId: site.id, startMin: input.startMin, endMin: input.endMin, note: input.note || null },
    });
    await bumpVehicleDay(tx, vd.id);
    warnings.push(...siteWarnings(site, input.date).map((w) => w.text));
    await audit(tx, {
      userId: actorId,
      action: "assignment.create",
      entityType: "SiteAssignment",
      entityId: vd.id,
      date: input.date,
      summary: `${vehicle.licensePlate} auf „${site.name}“ eingeplant, ${timeRange(input.startMin, input.endMin)} (${formatDayShort(input.date)})`,
    });
  });
  return finish(actorId, [input.date], messages, warnings);
}

export async function updateAssignment(actorId: string, input: z.infer<typeof assignmentUpdateSchema>): Promise<PlanningResult> {
  const warnings: string[] = [];
  let date = "";
  await db.$transaction(async (tx) => {
    const cur = await tx.siteAssignment.findUnique({ where: { id: input.id }, include: { site: true, vehicleDay: { include: { vehicle: true } } } });
    if (!cur) throw conflict("Der Einsatz wurde inzwischen gelöscht. Die Ansicht wird aktualisiert.");
    date = cur.vehicleDay.date;
    const start = input.startMin ?? cur.startMin;
    const end = input.endMin ?? cur.endMin;
    if (end <= start) throw badRequest("Das Ende muss nach dem Beginn liegen.");
    const site = input.siteId && input.siteId !== cur.siteId ? await tx.site.findUnique({ where: { id: input.siteId } }) : cur.site;
    if (!site || (!site.active && site.id !== cur.siteId)) throw badRequest("Bitte eine aktive Baustelle wählen.");
    await assertNoOverlap(tx, cur.vehicleDayId, start, end, cur.id);

    const res = await tx.siteAssignment.updateMany({
      where: { id: cur.id, version: input.version },
      data: { siteId: site.id, startMin: start, endMin: end, ...(input.note !== undefined ? { note: input.note || null } : {}), version: { increment: 1 } },
    });
    if (res.count !== 1) throw conflict();
    await bumpVehicleDay(tx, cur.vehicleDayId);
    if (site.id !== cur.siteId) warnings.push(...siteWarnings(site, date).map((w) => w.text));

    const changes: string[] = [];
    if (site.id !== cur.siteId) changes.push(`Baustelle „${cur.site.name}“ → „${site.name}“`);
    if (start !== cur.startMin || end !== cur.endMin) changes.push(`Zeit ${timeRange(cur.startMin, cur.endMin)} → ${timeRange(start, end)}`);
    if (input.note !== undefined && (input.note || null) !== cur.note) changes.push("Notiz geändert");
    await audit(tx, {
      userId: actorId,
      action: "assignment.update",
      entityType: "SiteAssignment",
      entityId: cur.id,
      date,
      summary: `Einsatz ${cur.vehicleDay.vehicle.licensePlate} (${formatDayShort(date)}) geändert${changes.length ? ": " + changes.join(", ") : ""}`,
    });
  });
  return finish(actorId, [date], [], warnings);
}

export async function deleteAssignment(actorId: string, input: z.infer<typeof assignmentDeleteSchema>): Promise<PlanningResult> {
  let date = "";
  await db.$transaction(async (tx) => {
    const cur = await tx.siteAssignment.findUnique({ where: { id: input.id }, include: { site: true, vehicleDay: { include: { vehicle: true } } } });
    if (!cur) throw conflict("Der Einsatz wurde inzwischen gelöscht. Die Ansicht wird aktualisiert.");
    date = cur.vehicleDay.date;
    const res = await tx.siteAssignment.deleteMany({ where: { id: cur.id, version: input.version } });
    if (res.count !== 1) throw conflict();
    await bumpVehicleDay(tx, cur.vehicleDayId);
    await cleanupVehicleDay(tx, cur.vehicleDayId);
    await audit(tx, {
      userId: actorId,
      action: "assignment.delete",
      entityType: "SiteAssignment",
      entityId: cur.id,
      date,
      summary: `${cur.vehicleDay.vehicle.licensePlate} von „${cur.site.name}“ entfernt, ${timeRange(cur.startMin, cur.endMin)} (${formatDayShort(date)})`,
    });
  });
  return finish(actorId, [date], [], []);
}

/** Fahrzeug für den Tag komplett freigeben: Besatzung zurück in den Pool, Einsätze löschen */
export async function releaseVehicle(actorId: string, input: z.infer<typeof vehicleReleaseSchema>): Promise<PlanningResult> {
  await db.$transaction(async (tx) => {
    const vd = await tx.vehicleDay.findUnique({
      where: { date_vehicleId: { date: input.date, vehicleId: input.vehicleId } },
      include: { vehicle: true, _count: { select: { crew: true, assignments: true } } },
    });
    if (!vd) return;
    const res = await tx.vehicleDay.deleteMany({ where: { id: vd.id, version: input.version } });
    if (res.count !== 1) throw conflict("Das Fahrzeug wurde inzwischen von jemand anderem geändert. Die Ansicht wird aktualisiert.");
    await audit(tx, {
      userId: actorId,
      action: "vehicle.release",
      entityType: "VehicleDay",
      entityId: vd.id,
      date: input.date,
      summary: `${vd.vehicle.licensePlate} für ${formatDayShort(input.date)} freigegeben (${vd._count.crew} Personen zurück in den Pool, ${vd._count.assignments} Einsätze entfernt)`,
    });
  });
  return finish(actorId, [input.date], [], []);
}

/** Abwesenheits-Hilfe für andere Module */
export { absenceOn };
