import "server-only";
import type { z } from "zod";
import type { vehicleCreateSchema, vehicleUpdateSchema } from "@/lib/masterdata-schemas";
import { audit } from "../../audit";
import { db, type Tx } from "../../db";
import { badRequest, conflict, notFound } from "../../errors";
import { describeChanges, summaryWith } from "./changes";

export const vehicleSelect = {
  id: true,
  licensePlate: true,
  name: true,
  type: true,
  seats: true,
  defaultDriverId: true,
  note: true,
  active: true,
  sortOrder: true,
  version: true,
  defaultDriver: { select: { id: true, firstName: true, lastName: true, shortName: true, active: true } },
  defaultMembers: {
    orderBy: { sortOrder: "asc" },
    select: { employee: { select: { id: true, firstName: true, lastName: true, shortName: true, active: true } } },
  },
} as const;

export function listVehicles() {
  return db.vehicle.findMany({
    select: vehicleSelect,
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

async function assertCrew(tx: Tx, seats: number, driverId: string | null, memberIds: string[]) {
  const ids = [...(driverId ? [driverId] : []), ...memberIds];
  if (ids.length > seats) {
    throw badRequest(`Die Standard-Besatzung (${ids.length} Personen) übersteigt die Sitzplätze (${seats}).`);
  }
  if (ids.length === 0) return;
  const found = await tx.employee.findMany({ where: { id: { in: ids } }, select: { id: true, active: true, firstName: true, lastName: true } });
  if (found.length !== ids.length) throw badRequest("Ein ausgewählter Mitarbeiter existiert nicht.");
  const inactive = found.find((e) => !e.active);
  if (inactive) throw badRequest(`${inactive.firstName} ${inactive.lastName} ist inaktiv und kann nicht Standard-Besatzung sein.`);
}

function crewText(names: Map<string, string>, driverId: string | null, memberIds: string[]) {
  const d = driverId ? (names.get(driverId) ?? "?") : "–";
  const m = memberIds.map((id) => names.get(id) ?? "?").join(", ") || "–";
  return `Fahrer ${d}, Mitfahrer ${m}`;
}

export async function createVehicle(actorId: string, input: z.infer<typeof vehicleCreateSchema>) {
  const { defaultMemberIds, ...data } = input;
  return db.$transaction(async (tx) => {
    await assertCrew(tx, data.seats, data.defaultDriverId, defaultMemberIds);
    const v = await tx.vehicle.create({
      data: {
        ...data,
        defaultMembers: { create: defaultMemberIds.map((employeeId, i) => ({ employeeId, sortOrder: i })) },
      },
    });
    await audit(tx, { userId: actorId, action: "vehicle.create", entityType: "Vehicle", entityId: v.id, summary: `Fahrzeug ${v.licensePlate} (${v.name}) angelegt` });
    return tx.vehicle.findUniqueOrThrow({ where: { id: v.id }, select: vehicleSelect });
  });
}

export async function updateVehicle(actorId: string, id: string, input: z.infer<typeof vehicleUpdateSchema>) {
  const { version, defaultMemberIds, ...data } = input;
  return db.$transaction(async (tx) => {
    const cur = await tx.vehicle.findUnique({ where: { id }, include: { defaultMembers: { orderBy: { sortOrder: "asc" } } } });
    if (!cur) throw notFound("Fahrzeug nicht gefunden.");
    const curMembers = cur.defaultMembers.map((m) => m.employeeId);
    const seats = data.seats ?? cur.seats;
    const driverId = data.defaultDriverId === undefined ? cur.defaultDriverId : data.defaultDriverId;
    const memberIds = defaultMemberIds ?? curMembers;
    if (driverId && memberIds.includes(driverId)) throw badRequest("Der Fahrer kann nicht zusätzlich Mitfahrer sein.");
    // Nur prüfen, wenn sich Besatzung oder Sitzplätze ändern (Reaktivieren eines Altfahrzeugs bleibt möglich)
    if (data.seats !== undefined || data.defaultDriverId !== undefined || defaultMemberIds !== undefined) {
      await assertCrew(tx, seats, driverId, memberIds);
    }

    const res = await tx.vehicle.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (res.count !== 1) throw conflict();
    if (defaultMemberIds) {
      await tx.vehicleDefaultMember.deleteMany({ where: { vehicleId: id } });
      await tx.vehicleDefaultMember.createMany({ data: defaultMemberIds.map((employeeId, i) => ({ vehicleId: id, employeeId, sortOrder: i })) });
    }

    const changes = describeChanges(cur, data, {
      licensePlate: "Kennzeichen",
      name: "Bezeichnung",
      type: "Typ",
      seats: "Sitzplätze",
      note: "Notiz",
      sortOrder: "Reihenfolge",
      active: "Status",
    });
    const crewChanged = driverId !== cur.defaultDriverId || JSON.stringify(memberIds) !== JSON.stringify(curMembers);
    if (crewChanged) {
      const people = await tx.employee.findMany({
        where: { id: { in: [driverId, cur.defaultDriverId, ...memberIds, ...curMembers].filter(Boolean) as string[] } },
        select: { id: true, shortName: true },
      });
      const names = new Map(people.map((p) => [p.id, p.shortName]));
      changes.push(`Standard-Besatzung: ${crewText(names, cur.defaultDriverId, curMembers)} → ${crewText(names, driverId, memberIds)}`);
    }
    await audit(tx, { userId: actorId, action: "vehicle.update", entityType: "Vehicle", entityId: id, summary: summaryWith(`Fahrzeug ${cur.licensePlate} geändert`, changes) });
    return tx.vehicle.findUniqueOrThrow({ where: { id }, select: vehicleSelect });
  });
}
