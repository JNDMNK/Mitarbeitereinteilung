import "server-only";
import type { z } from "zod";
import { diffDays, formatDate, formatRange } from "@/lib/dates";
import type { absenceCreateSchema, absenceUpdateSchema } from "@/lib/masterdata-schemas";
import { audit } from "../audit";
import { publishChange } from "../events";
import { db, type DbOrTx, type Tx } from "../db";
import { badRequest, conflict, notFound } from "../errors";

const MAX_DAYS = 366;

export const absenceSelect = {
  id: true,
  employeeId: true,
  typeId: true,
  startDate: true,
  endDate: true,
  note: true,
  withVehicle: true,
  version: true,
  type: { select: { id: true, name: true, code: true, color: true } },
  employee: { select: { id: true, firstName: true, lastName: true, shortName: true } },
} as const;

/** Alle Abwesenheiten, die den Zeitraum [from, to] berühren */
export function listAbsencesInRange(from: string, to: string, client: DbOrTx = db) {
  return client.absence.findMany({
    where: { startDate: { lte: to }, endDate: { gte: from } },
    select: absenceSelect,
    orderBy: [{ startDate: "asc" }],
  });
}

async function assertNoOverlap(tx: Tx, employeeId: string, start: string, end: string, exceptId?: string) {
  const clash = await tx.absence.findFirst({
    where: { employeeId, startDate: { lte: end }, endDate: { gte: start }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    include: { type: true },
  });
  if (clash) {
    throw badRequest(`Überschneidet sich mit bestehender Abwesenheit „${clash.type.name}“ ${formatRange(clash.startDate, clash.endDate)}.`);
  }
}

function assertLength(start: string, end: string) {
  if (diffDays(start, end) + 1 > MAX_DAYS) throw badRequest("Eine Abwesenheit darf höchstens ein Jahr umfassen.");
}

async function assertType(tx: Tx, typeId: string, currentTypeId?: string) {
  const t = await tx.absenceType.findUnique({ where: { id: typeId } });
  if (!t || (!t.active && t.id !== currentTypeId)) throw badRequest("Bitte eine aktive Abwesenheitsart wählen.");
  return t;
}

/** Tage, an denen der Mitarbeiter im Zeitraum bereits auf einem Fahrzeug eingeteilt ist (für Hinweis) */
async function assignedDays(tx: Tx, employeeId: string, start: string, end: string): Promise<string[]> {
  const rows = await tx.crewMember.findMany({
    where: { employeeId, date: { gte: start, lte: end } },
    select: { date: true },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => r.date);
}

/** Fahrzeuge, deren Besitzer (Standard-Fahrer) der Mitarbeiter ist */
async function ownedVehicles(tx: Tx, employeeId: string) {
  return tx.vehicle.findMany({ where: { defaultDriverId: employeeId, active: true }, select: { id: true, licensePlate: true } });
}

/** Hinweis, wenn ein mitgenommenes Fahrzeug im Zeitraum schon eingeplant ist */
async function vehicleWarnings(tx: Tx, employeeId: string, start: string, end: string): Promise<string[]> {
  const out: string[] = [];
  for (const v of await ownedVehicles(tx, employeeId)) {
    const days = await tx.vehicleDay.findMany({ where: { vehicleId: v.id, date: { gte: start, lte: end } }, select: { date: true }, orderBy: { date: "asc" } });
    if (days.length) {
      out.push(
        `Achtung: Fahrzeug ${v.licensePlate} ist an ${days.length} Tag(en) bereits eingeplant (${days.slice(0, 5).map((d) => formatDate(d.date)).join(", ")}${days.length > 5 ? " …" : ""}), ist aber nicht verfügbar. Bitte die Einteilung prüfen.`,
      );
    }
  }
  return out;
}

function warningFor(days: string[]): string[] {
  if (days.length === 0) return [];
  const list = days.slice(0, 5).map(formatDate).join(", ") + (days.length > 5 ? " …" : "");
  return [`Achtung: Der Mitarbeiter ist an ${days.length} Tag(en) bereits eingeteilt (${list}). Bitte die Einteilung prüfen.`];
}

export async function createAbsence(actorId: string, input: z.infer<typeof absenceCreateSchema>) {
  assertLength(input.startDate, input.endDate);
  const result = await db.$transaction(async (tx) => {
    const emp = await tx.employee.findUnique({ where: { id: input.employeeId } });
    if (!emp || !emp.active) throw badRequest("Bitte einen aktiven Mitarbeiter wählen.");
    const type = await assertType(tx, input.typeId);
    await assertNoOverlap(tx, input.employeeId, input.startDate, input.endDate);
    // "mit Fahrzeug" nur, wenn der Mitarbeiter wirklich ein Fahrzeug besitzt
    const withVehicle = !!input.withVehicle && (await ownedVehicles(tx, emp.id)).length > 0;
    const a = await tx.absence.create({ data: { ...input, withVehicle }, select: absenceSelect });
    await audit(tx, {
      userId: actorId,
      action: "absence.create",
      entityType: "Absence",
      entityId: a.id,
      date: input.startDate,
      summary: `${type.name} für ${emp.firstName} ${emp.lastName} ${formatRange(input.startDate, input.endDate)} eingetragen${withVehicle ? " (mit Fahrzeug)" : ""}`,
    });
    return {
      absence: a,
      warnings: [
        ...warningFor(await assignedDays(tx, emp.id, input.startDate, input.endDate)),
        ...(withVehicle ? await vehicleWarnings(tx, emp.id, input.startDate, input.endDate) : []),
      ],
    };
  });
  publishChange({ scope: "absences", userId: actorId });
  return result;
}

export async function updateAbsence(actorId: string, id: string, input: z.infer<typeof absenceUpdateSchema>) {
  const { version, ...data } = input;
  const result = await db.$transaction(async (tx) => {
    const cur = await tx.absence.findUnique({ where: { id }, include: { type: true, employee: true } });
    if (!cur) throw notFound("Abwesenheit nicht gefunden (evtl. bereits gelöscht).");
    const start = data.startDate ?? cur.startDate;
    const end = data.endDate ?? cur.endDate;
    if (start > end) throw badRequest("Das Ende darf nicht vor dem Beginn liegen.");
    assertLength(start, end);
    const type = data.typeId ? await assertType(tx, data.typeId, cur.typeId) : cur.type;
    await assertNoOverlap(tx, cur.employeeId, start, end, id);

    const withVehicle = data.withVehicle === undefined ? cur.withVehicle : !!data.withVehicle && (await ownedVehicles(tx, cur.employeeId)).length > 0;
    const res = await tx.absence.updateMany({ where: { id, version }, data: { ...data, withVehicle, version: { increment: 1 } } });
    if (res.count !== 1) throw conflict();

    const changes: string[] = [];
    if (withVehicle !== cur.withVehicle) changes.push(withVehicle ? "Fahrzeug ist mit abwesend" : "Fahrzeug bleibt da");
    if (type.id !== cur.typeId) changes.push(`Art: ${cur.type.name} → ${type.name}`);
    if (start !== cur.startDate || end !== cur.endDate)
      changes.push(`Zeitraum: ${formatRange(cur.startDate, cur.endDate)} → ${formatRange(start, end)}`);
    if (data.note !== undefined && (data.note ?? null) !== (cur.note ?? null)) changes.push("Notiz geändert");
    await audit(tx, {
      userId: actorId,
      action: "absence.update",
      entityType: "Absence",
      entityId: id,
      date: start,
      summary: `Abwesenheit von ${cur.employee.firstName} ${cur.employee.lastName} geändert${changes.length ? ": " + changes.join(", ") : ""}`,
    });
    const absence = await tx.absence.findUniqueOrThrow({ where: { id }, select: absenceSelect });
    return {
      absence,
      warnings: [...warningFor(await assignedDays(tx, cur.employeeId, start, end)), ...(withVehicle ? await vehicleWarnings(tx, cur.employeeId, start, end) : [])],
    };
  });
  publishChange({ scope: "absences", userId: actorId });
  return result;
}

export async function deleteAbsence(actorId: string, id: string, version: number) {
  const result = await db.$transaction(async (tx) => {
    const cur = await tx.absence.findUnique({ where: { id }, include: { type: true, employee: true } });
    if (!cur) throw notFound("Abwesenheit nicht gefunden (evtl. bereits gelöscht).");
    const res = await tx.absence.deleteMany({ where: { id, version } });
    if (res.count !== 1) throw conflict();
    await audit(tx, {
      userId: actorId,
      action: "absence.delete",
      entityType: "Absence",
      entityId: id,
      date: cur.startDate,
      summary: `${cur.type.name} von ${cur.employee.firstName} ${cur.employee.lastName} ${formatRange(cur.startDate, cur.endDate)} gelöscht`,
    });
  });
  publishChange({ scope: "absences", userId: actorId });
  return result;
}
