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
  crewTransferSchema,
  dayCopySchema,
  vehicleReleaseSchema,
  vehicleTransferSchema,
  NewSite,
} from "@/lib/planning-schemas";
import type { PlanningData, PlanningResult } from "@/lib/planning-types";
import { userInitials } from "@/lib/initials";
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
        crew: {
          select: { id: true, employeeId: true, sortOrder: true, assignedById: true, createdAt: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        assignments: {
          select: { id: true, siteId: true, startMin: true, endMin: true, note: true, version: true, updatedById: true, updatedAt: true },
          orderBy: { startMin: "asc" },
        },
      },
    }),
    db.absence.findMany({
      where: { startDate: { lte: to }, endDate: { gte: from } },
      select: { id: true, employeeId: true, typeId: true, startDate: true, endDate: true, note: true, withVehicle: true },
    }),
    db.department.findMany({ select: { id: true, name: true, color: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.absenceType.findMany({ select: { id: true, name: true, code: true, color: true }, orderBy: { sortOrder: "asc" } }),
    db.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);

  const usedEmployees = new Set(vehicleDays.flatMap((v) => v.crew.map((c) => c.employeeId)));
  const usedVehicles = new Set(vehicleDays.map((v) => v.vehicleId));
  const usedSites = new Set(vehicleDays.flatMap((v) => v.assignments.map((a) => a.siteId)));
  const plannerIds = new Set(
    vehicleDays.flatMap((v) => [...v.crew.map((c) => c.assignedById), ...v.assignments.map((a) => a.updatedById)]).filter((x): x is string => !!x),
  );

  const [employees, vehicles, sites, planners] = await Promise.all([
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
        departmentId: true,
        defaultMembers: { select: { employeeId: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.site.findMany({
      where: { OR: [{ active: true, status: { not: "DONE" } }, { id: { in: [...usedSites] } }] },
      select: { id: true, name: true, address: true, customer: true, orderNumber: true, startDate: true, endDate: true, status: true, note: true, color: true, active: true, adHoc: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { id: { in: [...plannerIds] } },
      select: { id: true, username: true, initials: true, employee: { select: { firstName: true, lastName: true, shortName: true } } },
    }),
  ]);

  return {
    from,
    to,
    employees,
    vehicles: vehicles.map(({ defaultDriverId, defaultMembers, ...v }) => ({
      ...v,
      ownerId: defaultDriverId,
      defaultIds: [...(defaultDriverId ? [defaultDriverId] : []), ...defaultMembers.map((m) => m.employeeId)],
    })),
    sites,
    departments,
    absenceTypes,
    absences,
    vehicleDays: vehicleDays.map((v) => ({
      ...v,
      crew: v.crew.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
      assignments: v.assignments.map((a) => ({ ...a, updatedAt: a.updatedAt.toISOString() })),
    })),
    planners: planners.map((u) => ({
      id: u.id,
      initials: userInitials(u),
      name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username,
    })),
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

/** Ist das Fahrzeug an dem Tag weg, weil der Besitzer mit ihm abwesend ist? */
async function vehicleBlock(tx: Tx, vehicle: { defaultDriverId: string | null }, date: string) {
  if (!vehicle.defaultDriverId) return null;
  return tx.absence.findFirst({
    where: { employeeId: vehicle.defaultDriverId, withVehicle: true, startDate: { lte: date }, endDate: { gte: date } },
    include: { type: true, employee: true },
  });
}

async function assertVehicleAvailable(tx: Tx, vehicle: { licensePlate: string; defaultDriverId: string | null }, date: string) {
  const block = await vehicleBlock(tx, vehicle, date);
  if (block) {
    throw badRequest(
      `${vehicle.licensePlate} ist am ${formatDayShort(date)} nicht verfügbar – mit ${fullName(block.employee)} abwesend (${block.type.name}).`,
    );
  }
}

/**
 * Fahrzeug-Tag holen oder anlegen. Beim Anlegen wird die Standard-Besatzung
 * vorbelegt – außer abwesende, inaktive oder anderweitig eingeteilte Mitarbeiter.
 */
async function ensureVehicleDay(tx: Tx, actorId: string, date: string, vehicleId: string, messages: string[], prefill = true) {
  const existing = await tx.vehicleDay.findUnique({ where: { date_vehicleId: { date, vehicleId } } });
  if (existing) return existing;

  const vehicle = await loadVehicle(tx, vehicleId);
  if (!vehicle.active) throw badRequest(`Fahrzeug ${vehicle.licensePlate} ist deaktiviert.`);
  await assertVehicleAvailable(tx, vehicle, date);
  const vd = await tx.vehicleDay.create({ data: { date, vehicleId } });
  if (!prefill) return vd;

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
      await tx.crewMember.create({ data: { vehicleDayId: vd.id, date, employeeId: empId, sortOrder: added.length, assignedById: actorId } });
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

/**
 * Mitarbeiter an einem Tag auf ein Fahrzeug setzen (verschiebt ihn, falls er
 * schon auf einem anderen sitzt). `expectedFrom` = wo der Client ihn vermutet.
 */
async function assignCrewTx(
  tx: Tx,
  actorId: string,
  p: { date: string; employeeId: string; vehicleId: string; expectedFrom: string | null },
  messages: string[],
  warnings: string[],
) {
  const emp = await loadEmployee(tx, p.employeeId);
  if (!emp.active) throw badRequest(`${fullName(emp)} ist deaktiviert.`);
  const vehicle = await loadVehicle(tx, p.vehicleId);

  const current = await tx.crewMember.findUnique({
    where: { date_employeeId: { date: p.date, employeeId: p.employeeId } },
    include: { vehicleDay: { include: { vehicle: true } } },
  });
  const currentVehicleId = current?.vehicleDay.vehicleId ?? null;
  if (currentVehicleId !== p.expectedFrom) {
    throw conflict(
      current
        ? `${fullName(emp)} wurde am ${formatDayShort(p.date)} inzwischen auf ${current.vehicleDay.vehicle.licensePlate} eingeteilt. Die Ansicht wird aktualisiert.`
        : `${fullName(emp)} ist am ${formatDayShort(p.date)} inzwischen nicht mehr eingeteilt. Die Ansicht wird aktualisiert.`,
    );
  }
  if (currentVehicleId === p.vehicleId) return;
  await assertVehicleAvailable(tx, vehicle, p.date);

  // Abwesende können nicht eingeteilt werden (nur zurück in den Pool)
  const absence = await absentOn(tx, emp.id, p.date);
  if (absence) {
    throw badRequest(
      `${fullName(emp)} ist am ${formatDayShort(p.date)} abwesend (${absence.type.name}) und kann nicht eingeteilt werden. Bitte zuerst die Abwesenheit ändern.`,
    );
  }

  if (current) {
    await tx.crewMember.delete({ where: { id: current.id } });
    await bumpVehicleDay(tx, current.vehicleDayId);
    await cleanupVehicleDay(tx, current.vehicleDayId);
  }
  // Einzelne Person auf ein Fahrzeug: keine Vorbelegung (die gibt es beim Einplanen des Fahrzeugs)
  const vd = await ensureVehicleDay(tx, actorId, p.date, p.vehicleId, messages, false);
  const already = await tx.crewMember.findUnique({ where: { date_employeeId: { date: p.date, employeeId: p.employeeId } } });
  if (!already) {
    const count = await tx.crewMember.count({ where: { vehicleDayId: vd.id } });
    await tx.crewMember.create({ data: { vehicleDayId: vd.id, date: p.date, employeeId: p.employeeId, sortOrder: count, assignedById: actorId } });
  }
  await bumpVehicleDay(tx, vd.id);

  const crewCount = await tx.crewMember.count({ where: { vehicleDayId: vd.id } });
  if (crewCount > vehicle.seats) warnings.push(`${vehicle.licensePlate} ist am ${formatDayShort(p.date)} überbelegt (${crewCount}/${vehicle.seats}).`);

  await audit(tx, {
    userId: actorId,
    action: current ? "crew.move" : "crew.assign",
    entityType: "CrewMember",
    entityId: emp.id,
    date: p.date,
    summary: current
      ? `${fullName(emp)} von ${current.vehicleDay.vehicle.licensePlate} nach ${vehicle.licensePlate} verschoben (${formatDayShort(p.date)})`
      : `${fullName(emp)} auf ${vehicle.licensePlate} eingeteilt (${formatDayShort(p.date)})`,
  });
}

async function removeCrewTx(tx: Tx, actorId: string, p: { date: string; employeeId: string; expectedFrom: string }) {
  const emp = await loadEmployee(tx, p.employeeId);
  const current = await tx.crewMember.findUnique({
    where: { date_employeeId: { date: p.date, employeeId: p.employeeId } },
    include: { vehicleDay: { include: { vehicle: true } } },
  });
  if (!current || current.vehicleDay.vehicleId !== p.expectedFrom) {
    throw conflict(`${fullName(emp)} wurde am ${formatDayShort(p.date)} inzwischen umgeplant. Die Ansicht wird aktualisiert.`);
  }
  await tx.crewMember.delete({ where: { id: current.id } });
  await bumpVehicleDay(tx, current.vehicleDayId);
  await cleanupVehicleDay(tx, current.vehicleDayId);
  await audit(tx, {
    userId: actorId,
    action: "crew.remove",
    entityType: "CrewMember",
    entityId: emp.id,
    date: p.date,
    summary: `${fullName(emp)} von ${current.vehicleDay.vehicle.licensePlate} entfernt (${formatDayShort(p.date)})`,
  });
}

export async function assignCrew(actorId: string, input: z.infer<typeof crewAssignSchema>): Promise<PlanningResult> {
  const messages: string[] = [];
  const warnings: string[] = [];
  await db.$transaction((tx) =>
    assignCrewTx(tx, actorId, { date: input.date, employeeId: input.employeeId, vehicleId: input.vehicleId, expectedFrom: input.expectedFromVehicleId }, messages, warnings),
  );
  return finish(actorId, [input.date], messages, warnings);
}

export async function removeCrew(actorId: string, input: z.infer<typeof crewRemoveSchema>): Promise<PlanningResult> {
  await db.$transaction((tx) => removeCrewTx(tx, actorId, { date: input.date, employeeId: input.employeeId, expectedFrom: input.expectedFromVehicleId }));
  return finish(actorId, [input.date], [], []);
}

/** Mitarbeiter auf ein Fahrzeug an einem anderen Tag verschieben oder kopieren */
export async function transferCrew(actorId: string, input: z.infer<typeof crewTransferSchema>): Promise<PlanningResult> {
  const messages: string[] = [];
  const warnings: string[] = [];
  await db.$transaction(async (tx) => {
    await assignCrewTx(
      tx,
      actorId,
      { date: input.toDate, employeeId: input.employeeId, vehicleId: input.toVehicleId, expectedFrom: input.toExpectedVehicleId },
      messages,
      warnings,
    );
    if (!input.copy && input.fromVehicleId && input.fromDate !== input.toDate) {
      await removeCrewTx(tx, actorId, { date: input.fromDate, employeeId: input.employeeId, expectedFrom: input.fromVehicleId });
    }
  });
  return finish(actorId, [input.fromDate, input.toDate], messages, warnings);
}

// ---------------------------------------------------------------------------
// Baustelleneinsätze
// ---------------------------------------------------------------------------

const ADHOC_COLORS = ["#0d9488", "#2563eb", "#7c3aed", "#c026d3", "#ea580c", "#65a30d", "#0891b2", "#db2777"];

/** Bestehende Baustelle laden oder freie Baustelle anlegen */
async function resolveSite(tx: Tx, actorId: string, siteId: string | undefined, newSite: NewSite | undefined, date: string) {
  if (newSite) {
    // gleichnamigen, aktiven freien Eintrag wiederverwenden (z. B. am Folgetag erneut eingegeben)
    const existing = await tx.site.findFirst({ where: { adHoc: true, active: true, name: newSite.name, address: newSite.address } });
    if (existing) return existing;
    let h = 0;
    for (const ch of newSite.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const site = await tx.site.create({
      data: { name: newSite.name, address: newSite.address, status: "ACTIVE", adHoc: true, color: ADHOC_COLORS[h % ADHOC_COLORS.length] },
    });
    await audit(tx, {
      userId: actorId,
      action: "site.create",
      entityType: "Site",
      entityId: site.id,
      date,
      summary: `Freie Baustelle „${site.name}“ in der Planung angelegt`,
    });
    return site;
  }
  const site = siteId ? await tx.site.findUnique({ where: { id: siteId } }) : null;
  if (!site) throw badRequest("Bitte eine Baustelle wählen.");
  return site;
}

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
    const site = await resolveSite(tx, actorId, input.siteId, input.newSite, input.date);
    if (!site.active) throw badRequest("Bitte eine aktive Baustelle wählen.");
    const vehicle = await loadVehicle(tx, input.vehicleId);
    await assertVehicleAvailable(tx, vehicle, input.date);
    const vd = await ensureVehicleDay(tx, actorId, input.date, input.vehicleId, messages);
    await assertNoOverlap(tx, vd.id, input.startMin, input.endMin);
    await tx.siteAssignment.create({
      data: { vehicleDayId: vd.id, siteId: site.id, startMin: input.startMin, endMin: input.endMin, note: input.note || null, updatedById: actorId },
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
    const site = input.newSite
      ? await resolveSite(tx, actorId, undefined, input.newSite, date)
      : input.siteId && input.siteId !== cur.siteId
        ? await tx.site.findUnique({ where: { id: input.siteId } })
        : cur.site;
    if (!site || (!site.active && site.id !== cur.siteId)) throw badRequest("Bitte eine aktive Baustelle wählen.");
    await assertNoOverlap(tx, cur.vehicleDayId, start, end, cur.id);

    const res = await tx.siteAssignment.updateMany({
      where: { id: cur.id, version: input.version },
      data: { siteId: site.id, startMin: start, endMin: end, ...(input.note !== undefined ? { note: input.note || null } : {}), updatedById: actorId, version: { increment: 1 } },
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

// ---------------------------------------------------------------------------
// Tagesübergreifend: Fahrzeug verschieben/kopieren, Tag übernehmen
// ---------------------------------------------------------------------------

/** Besatzung in einen Ziel-Fahrzeug-Tag übernehmen; Abwesende/anderweitig Eingeteilte werden ausgelassen */
async function copyCrewInto(
  tx: Tx,
  actorId: string,
  targetVdId: string,
  toDate: string,
  crew: { employeeId: string; employee: { firstName: string; lastName: string; shortName: string; active: boolean } }[],
  skipped: { absent: string[]; busy: string[] },
) {
  let added = 0;
  for (const c of crew) {
    if (!c.employee.active) continue;
    const abs = await absentOn(tx, c.employeeId, toDate);
    if (abs) {
      skipped.absent.push(`${c.employee.shortName} (${abs.type.code})`);
      continue;
    }
    const taken = await tx.crewMember.findUnique({
      where: { date_employeeId: { date: toDate, employeeId: c.employeeId } },
      include: { vehicleDay: { include: { vehicle: true } } },
    });
    if (taken) {
      if (taken.vehicleDayId !== targetVdId) skipped.busy.push(`${c.employee.shortName} (schon auf ${taken.vehicleDay.vehicle.licensePlate})`);
      continue;
    }
    const count = await tx.crewMember.count({ where: { vehicleDayId: targetVdId } });
    await tx.crewMember.create({ data: { vehicleDayId: targetVdId, date: toDate, employeeId: c.employeeId, sortOrder: count, assignedById: actorId } });
    added++;
  }
  return added;
}

function skippedWarnings(skipped: { absent: string[]; busy: string[] }): string[] {
  const w: string[] = [];
  if (skipped.absent.length) w.push(`Ausgelassen, weil abwesend: ${skipped.absent.join(", ")}.`);
  if (skipped.busy.length) w.push(`Ausgelassen, weil schon eingeteilt: ${skipped.busy.join(", ")}.`);
  return w;
}

/** Fahrzeug inkl. Besatzung auf einen anderen Tag verschieben oder kopieren (optional auf eine Baustelle) */
export async function transferVehicle(actorId: string, input: z.infer<typeof vehicleTransferSchema>): Promise<PlanningResult> {
  if (input.fromDate === input.toDate) throw badRequest("Quell- und Zieltag sind identisch.");
  if (input.toSiteId && (input.startMin === undefined || input.endMin === undefined)) throw badRequest("Bitte ein Zeitfenster angeben.");
  const messages: string[] = [];
  const warnings: string[] = [];
  await db.$transaction(async (tx) => {
    const vehicle = await loadVehicle(tx, input.vehicleId);
    if (!vehicle.active) throw badRequest(`Fahrzeug ${vehicle.licensePlate} ist deaktiviert.`);
    await assertVehicleAvailable(tx, vehicle, input.toDate);
    const src = await tx.vehicleDay.findUnique({
      where: { date_vehicleId: { date: input.fromDate, vehicleId: input.vehicleId } },
      include: { crew: { include: { employee: true }, orderBy: { sortOrder: "asc" } }, assignments: true },
    });
    if ((src?.version ?? null) !== input.fromVersion) {
      throw conflict(`${vehicle.licensePlate} wurde am ${formatDayShort(input.fromDate)} inzwischen geändert. Die Ansicht wird aktualisiert.`);
    }
    const srcAssignment = input.assignmentId ? src?.assignments.find((a) => a.id === input.assignmentId) : null;
    if (input.assignmentId && !srcAssignment) throw conflict("Der Einsatz wurde inzwischen geändert. Die Ansicht wird aktualisiert.");

    // Ziel-Fahrzeug-Tag: mitgebrachte Besatzung statt Standard-Besatzung
    let target = await tx.vehicleDay.findUnique({ where: { date_vehicleId: { date: input.toDate, vehicleId: input.vehicleId } } });
    if (!target) {
      target = src && src.crew.length > 0 ? await tx.vehicleDay.create({ data: { date: input.toDate, vehicleId: input.vehicleId } }) : await ensureVehicleDay(tx, actorId, input.toDate, input.vehicleId, messages);
    }
    const skipped = { absent: [] as string[], busy: [] as string[] };
    const added = src ? await copyCrewInto(tx, actorId, target.id, input.toDate, src.crew, skipped) : 0;
    warnings.push(...skippedWarnings(skipped));

    let siteName = "";
    if (input.toSiteId) {
      const site = await tx.site.findUnique({ where: { id: input.toSiteId } });
      if (!site || !site.active) throw badRequest("Bitte eine aktive Baustelle wählen.");
      siteName = site.name;
      await assertNoOverlap(tx, target.id, input.startMin!, input.endMin!);
      await tx.siteAssignment.create({
        data: { vehicleDayId: target.id, siteId: site.id, startMin: input.startMin!, endMin: input.endMin!, note: srcAssignment?.note ?? null, updatedById: actorId },
      });
      warnings.push(...siteWarnings(site, input.toDate).map((w) => w.text));
    }
    await bumpVehicleDay(tx, target.id);
    const crewCount = await tx.crewMember.count({ where: { vehicleDayId: target.id } });
    if (crewCount > vehicle.seats) warnings.push(`${vehicle.licensePlate} ist am ${formatDayShort(input.toDate)} überbelegt (${crewCount}/${vehicle.seats}).`);
    await cleanupVehicleDay(tx, target.id);

    // Quelle aufräumen (nur beim Verschieben)
    if (!input.copy && src) {
      if (srcAssignment) {
        await tx.siteAssignment.delete({ where: { id: srcAssignment.id } });
        const remaining = await tx.siteAssignment.count({ where: { vehicleDayId: src.id } });
        if (remaining === 0) await tx.vehicleDay.delete({ where: { id: src.id } });
        else await bumpVehicleDay(tx, src.id);
      } else {
        await tx.vehicleDay.delete({ where: { id: src.id } });
      }
    }

    const verb = input.copy ? "kopiert" : "verschoben";
    await audit(tx, {
      userId: actorId,
      action: input.copy ? "vehicle.copy" : "vehicle.move",
      entityType: "VehicleDay",
      entityId: target.id,
      date: input.toDate,
      summary: `${vehicle.licensePlate} mit ${added} Person(en) von ${formatDayShort(input.fromDate)} nach ${formatDayShort(input.toDate)} ${verb}${
        siteName ? ` (Baustelle „${siteName}“, ${timeRange(input.startMin!, input.endMin!)})` : " (ohne Baustelle)"
      }`,
    });
  });
  return finish(actorId, [input.fromDate, input.toDate], messages, warnings);
}

/** Einteilung eines ganzen Tages auf einen anderen Tag übernehmen */
export async function copyDay(actorId: string, input: z.infer<typeof dayCopySchema>): Promise<PlanningResult> {
  if (input.fromDate === input.toDate) throw badRequest("Quell- und Zieltag sind identisch.");
  const messages: string[] = [];
  const warnings: string[] = [];
  await db.$transaction(async (tx) => {
    const src = await tx.vehicleDay.findMany({
      where: { date: input.fromDate },
      include: {
        vehicle: true,
        crew: { include: { employee: true }, orderBy: { sortOrder: "asc" } },
        assignments: { include: { site: true }, orderBy: { startMin: "asc" } },
      },
    });
    if (src.length === 0) throw badRequest(`Am ${formatDayShort(input.fromDate)} ist nichts eingeteilt.`);

    const [targetVehicles, targetAssignments] = await Promise.all([
      tx.vehicleDay.count({ where: { date: input.toDate } }),
      tx.siteAssignment.count({ where: { vehicleDay: { date: input.toDate } } }),
    ]);
    if (targetVehicles > 0 && !input.mode) {
      throw new ApiError(
        409,
        `Am ${formatDayShort(input.toDate)} sind bereits ${targetVehicles} Fahrzeug(e) mit ${targetAssignments} Einsatz/Einsätzen eingeteilt.`,
        "target_not_empty",
        { vehicles: targetVehicles, assignments: targetAssignments },
      );
    }
    if (input.mode === "replace") await tx.vehicleDay.deleteMany({ where: { date: input.toDate } });

    const skipped = { absent: [] as string[], busy: [] as string[] };
    const skippedOther: string[] = [];
    const siteWarn = new Set<string>();
    let vehicles = 0;
    let assignments = 0;
    let people = 0;
    for (const vd of src) {
      if (!vd.vehicle.active) {
        skippedOther.push(`${vd.vehicle.licensePlate} (deaktiviert)`);
        continue;
      }
      const block = await vehicleBlock(tx, vd.vehicle, input.toDate);
      if (block) {
        skippedOther.push(`${vd.vehicle.licensePlate} (mit ${block.employee.shortName} abwesend)`);
        continue;
      }
      const target =
        (await tx.vehicleDay.findUnique({ where: { date_vehicleId: { date: input.toDate, vehicleId: vd.vehicleId } } })) ??
        (await tx.vehicleDay.create({ data: { date: input.toDate, vehicleId: vd.vehicleId, note: vd.note } }));
      const existing = await tx.siteAssignment.findMany({ where: { vehicleDayId: target.id } });
      for (const a of vd.assignments) {
        if (!a.site.active) {
          skippedOther.push(`„${a.site.name}“ (deaktiviert)`);
          continue;
        }
        const clash = findOverlap(existing, a.startMin, a.endMin);
        if (clash) {
          skippedOther.push(`${vd.vehicle.licensePlate} ${timeRange(a.startMin, a.endMin)} „${a.site.name}“ (Zeit belegt)`);
          continue;
        }
        const created = await tx.siteAssignment.create({
          data: { vehicleDayId: target.id, siteId: a.siteId, startMin: a.startMin, endMin: a.endMin, note: a.note, updatedById: actorId },
        });
        existing.push(created);
        assignments++;
        for (const w of siteWarnings(a.site, input.toDate)) siteWarn.add(`„${a.site.name}“: ${w.text}`);
      }
      people += await copyCrewInto(tx, actorId, target.id, input.toDate, vd.crew, skipped);
      await bumpVehicleDay(tx, target.id);
      await cleanupVehicleDay(tx, target.id);
      vehicles++;
    }

    messages.push(
      `Einteilung von ${formatDayShort(input.fromDate)} nach ${formatDayShort(input.toDate)} übernommen${input.mode === "replace" ? " (Zieltag ersetzt)" : input.mode === "merge" ? " (zusammengeführt)" : ""}: ${vehicles} Fahrzeuge, ${assignments} Einsätze, ${people} Personen.`,
    );
    warnings.push(...skippedWarnings(skipped));
    if (skippedOther.length) warnings.push(`Nicht übernommen: ${skippedOther.join(", ")}.`);
    warnings.push(...siteWarn);

    await audit(tx, {
      userId: actorId,
      action: "day.copy",
      entityType: "Day",
      entityId: input.toDate,
      date: input.toDate,
      summary: `${messages[0]}${skipped.absent.length ? ` Ausgelassen (abwesend): ${skipped.absent.join(", ")}.` : ""}`,
    });
  });
  return finish(actorId, [input.toDate], messages, warnings);
}

/** Abwesenheits-Hilfe für andere Module */
export { absenceOn };
