import "server-only";
import type { z } from "zod";
import { QUALIFICATION_LABELS, type Qualification } from "@/lib/constants";
import type { employeeCreateSchema, employeeUpdateSchema } from "@/lib/masterdata-schemas";
import { audit } from "../../audit";
import { hashPassword } from "../../auth/password";
import { destroyUserSessions } from "../../auth/session";
import { db, type Tx } from "../../db";
import { badRequest, conflict, notFound } from "../../errors";
import { describeChanges, summaryWith } from "./changes";

export const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  shortName: true,
  qualification: true,
  departmentId: true,
  phone: true,
  active: true,
  version: true,
  department: { select: { id: true, name: true, color: true } },
  user: { select: { id: true, username: true, active: true } },
} as const;

export function listEmployees() {
  return db.employee.findMany({
    select: employeeSelect,
    orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
}

async function assertDepartment(tx: Tx, departmentId: string) {
  const d = await tx.department.findUnique({ where: { id: departmentId } });
  if (!d || !d.active) throw badRequest("Bitte eine aktive Abteilung wählen.");
}

export async function createEmployee(actorId: string, input: z.infer<typeof employeeCreateSchema>) {
  const { login, ...data } = input;
  const passwordHash = login ? await hashPassword(login.password) : null;
  return db.$transaction(async (tx) => {
    await assertDepartment(tx, data.departmentId);
    const emp = await tx.employee.create({ data });
    await audit(tx, {
      userId: actorId,
      action: "employee.create",
      entityType: "Employee",
      entityId: emp.id,
      summary: `Mitarbeiter ${emp.firstName} ${emp.lastName} (${emp.shortName}) angelegt`,
    });
    if (login && passwordHash) {
      const user = await tx.user.create({
        data: { username: login.username, passwordHash, role: "EMPLOYEE", employeeId: emp.id, mustChangePassword: true },
      });
      await audit(tx, {
        userId: actorId,
        action: "user.create",
        entityType: "User",
        entityId: user.id,
        summary: `Login "${user.username}" für ${emp.firstName} ${emp.lastName} angelegt`,
      });
    }
    return tx.employee.findUniqueOrThrow({ where: { id: emp.id }, select: employeeSelect });
  });
}

export async function updateEmployee(actorId: string, id: string, input: z.infer<typeof employeeUpdateSchema>) {
  const { version, ...data } = input;
  const result = await db.$transaction(async (tx) => {
    const cur = await tx.employee.findUnique({ where: { id }, include: { user: true, department: true } });
    if (!cur) throw notFound("Mitarbeiter nicht gefunden.");
    if (data.departmentId && data.departmentId !== cur.departmentId) await assertDepartment(tx, data.departmentId);

    const res = await tx.employee.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (res.count !== 1) throw conflict();

    let deactivatedUser: string | null = null;
    if (data.active === false && cur.active && cur.user?.active) {
      // Login eines ausgeschiedenen Mitarbeiters ebenfalls sperren
      await tx.user.update({ where: { id: cur.user.id }, data: { active: false, version: { increment: 1 } } });
      deactivatedUser = cur.user.id;
    }

    const deps = data.departmentId ? await tx.department.findMany({ where: { id: { in: [cur.departmentId, data.departmentId] } } }) : [];
    const depName = (v: unknown) => deps.find((d) => d.id === v)?.name ?? "–";
    const changes = describeChanges(
      cur,
      data,
      { firstName: "Vorname", lastName: "Nachname", shortName: "Kürzel", qualification: "Ausbildung", departmentId: "Abteilung", phone: "Telefon", active: "Status" },
      (key, v) =>
        key === "qualification"
          ? (QUALIFICATION_LABELS[v as Qualification] ?? String(v))
          : key === "departmentId"
            ? depName(v)
            : v === null || v === undefined || v === ""
              ? "–"
              : String(v),
    );
    if (deactivatedUser) changes.push(`Login "${cur.user!.username}" gesperrt`);
    await audit(tx, {
      userId: actorId,
      action: "employee.update",
      entityType: "Employee",
      entityId: id,
      summary: summaryWith(`Mitarbeiter ${cur.firstName} ${cur.lastName} geändert`, changes),
    });
    return { deactivatedUser };
  });
  if (result.deactivatedUser) await destroyUserSessions(result.deactivatedUser);
  return db.employee.findUniqueOrThrow({ where: { id }, select: employeeSelect });
}
