import "server-only";
import type { z } from "zod";
import type { absenceTypeSchema, absenceTypeUpdateSchema, departmentSchema, departmentUpdateSchema } from "@/lib/masterdata-schemas";
import { audit } from "../../audit";
import { db } from "../../db";
import { conflict, notFound } from "../../errors";
import { describeChanges, summaryWith } from "./changes";

// ---------------- Abteilungen ----------------

export function listDepartments() {
  return db.department.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { employees: { where: { active: true } } } } },
  });
}

export async function createDepartment(actorId: string, input: z.infer<typeof departmentSchema>) {
  return db.$transaction(async (tx) => {
    const d = await tx.department.create({ data: input });
    await audit(tx, { userId: actorId, action: "department.create", entityType: "Department", entityId: d.id, summary: `Abteilung "${d.name}" angelegt` });
    return d;
  });
}

export async function updateDepartment(actorId: string, id: string, input: z.infer<typeof departmentUpdateSchema>) {
  const { version, ...data } = input;
  return db.$transaction(async (tx) => {
    const cur = await tx.department.findUnique({ where: { id } });
    if (!cur) throw notFound("Abteilung nicht gefunden.");
    const res = await tx.department.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (res.count !== 1) throw conflict();
    const changes = describeChanges(cur, data, { name: "Name", color: "Farbe", sortOrder: "Reihenfolge", active: "Status" });
    await audit(tx, { userId: actorId, action: "department.update", entityType: "Department", entityId: id, summary: summaryWith(`Abteilung "${cur.name}" geändert`, changes) });
    return tx.department.findUniqueOrThrow({ where: { id } });
  });
}

// ---------------- Abwesenheitsarten ----------------

export function listAbsenceTypes() {
  return db.absenceType.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }] });
}

export async function createAbsenceType(actorId: string, input: z.infer<typeof absenceTypeSchema>) {
  return db.$transaction(async (tx) => {
    const t = await tx.absenceType.create({ data: input });
    await audit(tx, { userId: actorId, action: "absenceType.create", entityType: "AbsenceType", entityId: t.id, summary: `Abwesenheitsart "${t.name}" (${t.code}) angelegt` });
    return t;
  });
}

export async function updateAbsenceType(actorId: string, id: string, input: z.infer<typeof absenceTypeUpdateSchema>) {
  const { version, ...data } = input;
  return db.$transaction(async (tx) => {
    const cur = await tx.absenceType.findUnique({ where: { id } });
    if (!cur) throw notFound("Abwesenheitsart nicht gefunden.");
    const res = await tx.absenceType.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (res.count !== 1) throw conflict();
    const changes = describeChanges(cur, data, { name: "Name", code: "Kürzel", color: "Farbe", sortOrder: "Reihenfolge", active: "Status" });
    await audit(tx, { userId: actorId, action: "absenceType.update", entityType: "AbsenceType", entityId: id, summary: summaryWith(`Abwesenheitsart "${cur.name}" geändert`, changes) });
    return tx.absenceType.findUniqueOrThrow({ where: { id } });
  });
}
