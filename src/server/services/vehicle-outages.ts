import "server-only";
import type { z } from "zod";
import { OUTAGE_ICON, outageLabel } from "@/lib/constants";
import { formatRange } from "@/lib/dates";
import type { outageCreateSchema, outageUpdateSchema } from "@/lib/masterdata-schemas";
import { audit } from "../audit";
import { db, type Tx } from "../db";
import { ApiError, badRequest, conflict, notFound } from "../errors";
import { publishChange } from "../events";

const outageSelect = {
  id: true,
  vehicleId: true,
  startDate: true,
  endDate: true,
  reason: true,
  note: true,
  version: true,
  vehicle: { select: { id: true, licensePlate: true, name: true, active: true } },
} as const;

export function listOutages(from: string, to: string) {
  return db.vehicleOutage.findMany({
    where: { startDate: { lte: to }, endDate: { gte: from } },
    select: outageSelect,
    orderBy: [{ startDate: "asc" }],
  });
}

/** Laufende und künftige Ausfälle (für die Stammdaten) */
export function listUpcomingOutages(today: string) {
  return db.vehicleOutage.findMany({ where: { endDate: { gte: today } }, select: outageSelect, orderBy: [{ startDate: "asc" }] });
}

type Input = { startDate: string; endDate: string; reason: string; note?: string | null; clearPlanning?: boolean };

async function checkAndClear(tx: Tx, actorId: string, vehicle: { id: string; licensePlate: string }, input: Input, exceptId?: string) {
  const overlap = await tx.vehicleOutage.findFirst({
    where: { vehicleId: vehicle.id, startDate: { lte: input.endDate }, endDate: { gte: input.startDate }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (overlap) throw badRequest(`Für ${vehicle.licensePlate} ist in diesem Zeitraum schon ein Ausfall eingetragen (${formatRange(overlap.startDate, overlap.endDate)}).`);

  const planned = await tx.vehicleDay.findMany({
    where: { vehicleId: vehicle.id, date: { gte: input.startDate, lte: input.endDate } },
    select: { id: true, date: true, crew: { select: { employeeId: true } }, _count: { select: { assignments: true } } },
    orderBy: { date: "asc" },
  });
  if (planned.length === 0) return [];
  const people = new Set(planned.flatMap((p) => p.crew.map((c) => c.employeeId))).size;
  const assignments = planned.reduce((n, p) => n + p._count.assignments, 0);
  if (!input.clearPlanning) {
    throw new ApiError(
      409,
      `${vehicle.licensePlate} ist in diesem Zeitraum an ${planned.length} Tag(en) eingeteilt (${people} Person(en), ${assignments} Einsatz/Einsätze).`,
      "vehicle_planned",
      { days: planned.map((p) => p.date), people, assignments },
    );
  }
  await tx.vehicleDay.deleteMany({ where: { id: { in: planned.map((p) => p.id) } } });
  await audit(tx, {
    userId: actorId,
    action: "vehicle.release",
    entityType: "Vehicle",
    entityId: vehicle.id,
    summary: `${vehicle.licensePlate} wegen Ausfall freigegeben: ${planned.length} Tag(e), ${people} Person(en) zurück in den Pool, ${assignments} Einsatz/Einsätze entfernt`,
  });
  return planned.map((p) => p.date);
}

function describe(input: Input) {
  return `${OUTAGE_ICON} ${outageLabel(input.reason)} ${formatRange(input.startDate, input.endDate)}${input.note ? ` (${input.note})` : ""}`;
}

export async function createOutage(actorId: string, input: z.infer<typeof outageCreateSchema>) {
  const result = await db.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId } });
    if (!vehicle) throw notFound("Fahrzeug nicht gefunden.");
    if (vehicle.kind === "ROOM") throw badRequest("Ausfälle gibt es nur für Fahrzeuge.");
    const cleared = await checkAndClear(tx, actorId, vehicle, input);
    const o = await tx.vehicleOutage.create({
      data: { vehicleId: vehicle.id, startDate: input.startDate, endDate: input.endDate, reason: input.reason, note: input.note ?? null },
      select: outageSelect,
    });
    await audit(tx, { userId: actorId, action: "outage.create", entityType: "VehicleOutage", entityId: o.id, summary: `${vehicle.licensePlate}: ${describe(input)} eingetragen` });
    return { outage: o, cleared };
  });
  publishChange({ scope: "planning", userId: actorId });
  publishChange({ scope: "masterdata", userId: actorId });
  return { outage: result.outage, message: `${result.outage.vehicle.licensePlate}: ${describe(input)} eingetragen${result.cleared.length ? ` – Einteilung an ${result.cleared.length} Tag(en) entfernt` : ""}.` };
}

export async function updateOutage(actorId: string, id: string, input: z.infer<typeof outageUpdateSchema>) {
  const result = await db.$transaction(async (tx) => {
    const cur = await tx.vehicleOutage.findUnique({ where: { id }, include: { vehicle: true } });
    if (!cur) throw notFound("Ausfall nicht gefunden.");
    if (cur.version !== input.version) throw conflict();
    const cleared = await checkAndClear(tx, actorId, cur.vehicle, input, id);
    const o = await tx.vehicleOutage.update({
      where: { id },
      data: { startDate: input.startDate, endDate: input.endDate, reason: input.reason, note: input.note ?? null, version: { increment: 1 } },
      select: outageSelect,
    });
    await audit(tx, {
      userId: actorId,
      action: "outage.update",
      entityType: "VehicleOutage",
      entityId: id,
      summary: `${cur.vehicle.licensePlate}: Ausfall geändert – ${describe(cur)} → ${describe(input)}`,
    });
    return { outage: o, cleared };
  });
  publishChange({ scope: "planning", userId: actorId });
  publishChange({ scope: "masterdata", userId: actorId });
  return { outage: result.outage, message: `${result.outage.vehicle.licensePlate}: ${describe(input)} gespeichert${result.cleared.length ? ` – Einteilung an ${result.cleared.length} Tag(en) entfernt` : ""}.` };
}

export async function deleteOutage(actorId: string, id: string, version: number) {
  const cur = await db.$transaction(async (tx) => {
    const cur = await tx.vehicleOutage.findUnique({ where: { id }, include: { vehicle: true } });
    if (!cur) throw notFound("Ausfall nicht gefunden.");
    if (cur.version !== version) throw conflict();
    await tx.vehicleOutage.delete({ where: { id } });
    await audit(tx, { userId: actorId, action: "outage.delete", entityType: "VehicleOutage", entityId: id, summary: `${cur.vehicle.licensePlate}: ${describe(cur)} gelöscht` });
    return cur;
  });
  publishChange({ scope: "planning", userId: actorId });
  publishChange({ scope: "masterdata", userId: actorId });
  return { message: `${cur.vehicle.licensePlate}: Ausfall gelöscht – Fahrzeug wieder verfügbar.` };
}
