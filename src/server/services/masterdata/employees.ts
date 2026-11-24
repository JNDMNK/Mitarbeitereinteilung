import "server-only";
import type { z } from "zod";
import { QUALIFICATION_LABELS, type Qualification } from "@/lib/constants";
import type { employeeCreateSchema, employeeLoginSchema, employeeUpdateSchema } from "@/lib/masterdata-schemas";
import type { Role } from "@/lib/roles";
import { audit } from "../../audit";
import { hashPassword } from "../../auth/password";
import { destroyUserSessions } from "../../auth/session";
import { publishChange } from "../../events";
import { db, type Tx } from "../../db";
import { badRequest, conflict, forbidden, notFound } from "../../errors";
import { describeChanges, summaryWith } from "./changes";

export const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  shortName: true,
  qualification: true,
  departmentId: true,
  phone: true,
  availableFrom: true,
  availableUntil: true,
  active: true,
  version: true,
  department: { select: { id: true, name: true, color: true } },
  user: { select: { id: true, username: true, active: true, role: true } },
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
  const result = await db.$transaction(async (tx) => {
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
        data: { username: login.username, passwordHash, role: "EMPLOYEE", employeeId: emp.id, mustChangePassword: false },
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
  publishChange({ scope: "masterdata", userId: actorId });
  return result;
}

export async function updateEmployee(actorId: string, id: string, input: z.infer<typeof employeeUpdateSchema>) {
  const { version, ...data } = input;
  const result = await db.$transaction(async (tx) => {
    const cur = await tx.employee.findUnique({ where: { id }, include: { user: true, department: true } });
    if (!cur) throw notFound("Mitarbeiter nicht gefunden.");
    if (data.departmentId && data.departmentId !== cur.departmentId) await assertDepartment(tx, data.departmentId);
    // Zeitraum gegen den zusammengeführten Stand prüfen
    const from = data.availableFrom === undefined ? cur.availableFrom : data.availableFrom;
    const until = data.availableUntil === undefined ? cur.availableUntil : data.availableUntil;
    if (from && until && from > until) throw badRequest("„im Betrieb bis“ darf nicht vor „von“ liegen.");
    if ((data.qualification ?? cur.qualification) === "PRAKTIKANT" && !until) throw badRequest("Bei Praktikanten bitte angeben, bis wann das Praktikum dauert.");

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
      {
        firstName: "Vorname",
        lastName: "Nachname",
        shortName: "Kürzel",
        qualification: "Ausbildung",
        departmentId: "Abteilung",
        phone: "Telefon",
        availableFrom: "im Betrieb ab",
        availableUntil: "im Betrieb bis",
        active: "Status",
      },
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
  publishChange({ scope: "masterdata", userId: actorId });
  return db.employee.findUniqueOrThrow({ where: { id }, select: employeeSelect });
}

/** Login für einen bestehenden Mitarbeiter anlegen oder einen gesperrten Login wieder freischalten */
export async function manageEmployeeLogin(actor: { id: string; role: Role }, employeeId: string, input: z.infer<typeof employeeLoginSchema>) {
  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!emp) throw notFound("Mitarbeiter nicht gefunden.");
  if (!emp.active) throw badRequest("Der Mitarbeiter ist deaktiviert. Bitte zuerst den Mitarbeiter aktivieren.");
  const name = `${emp.firstName} ${emp.lastName}`;

  if (input.action === "create") {
    if (emp.user) throw badRequest(`${name} hat bereits den Login "${emp.user.username}".`);
    const passwordHash = await hashPassword(input.password);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { username: input.username, passwordHash, role: "EMPLOYEE", employeeId: emp.id, mustChangePassword: false },
      });
      await audit(tx, { userId: actor.id, action: "user.create", entityType: "User", entityId: user.id, summary: `Login "${user.username}" für ${name} angelegt` });
    });
    return { message: `Login "${input.username}" für ${name} angelegt.` };
  }

  // freischalten
  const user = emp.user;
  if (!user) throw badRequest(`${name} hat noch keinen Login.`);
  if (user.role !== "EMPLOYEE" && actor.role !== "ADMIN") throw forbidden("Logins mit Rolle Admin oder Einteiler kann nur ein Admin freischalten.");
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        active: true,
        failedLogins: 0,
        lockedUntil: null,
        ...(passwordHash ? { passwordHash, mustChangePassword: false } : {}),
        version: { increment: 1 },
      },
    });
    await audit(tx, {
      userId: actor.id,
      action: "user.activate",
      entityType: "User",
      entityId: user.id,
      summary: `Login "${user.username}" von ${name} freigeschaltet${passwordHash ? " (neues Start-Passwort)" : ""}`,
    });
  });
  if (passwordHash) await destroyUserSessions(user.id);
  return { message: `Login "${user.username}" von ${name} ist wieder freigeschaltet${passwordHash ? " – neues Start-Passwort gilt ab sofort" : ""}.` };
}
