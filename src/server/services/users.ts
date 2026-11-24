import "server-only";
import type { z } from "zod";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import type { createUserSchema, updateUserSchema } from "@/lib/validation";
import { audit } from "../audit";
import { hashPassword, verifyPassword } from "../auth/password";
import { destroyUserSessions } from "../auth/session";
import { db, type Tx } from "../db";
import { badRequest, conflict, notFound } from "../errors";

export const userListSelect = {
  id: true,
  username: true,
  initials: true,
  role: true,
  active: true,
  lastLoginAt: true,
  lockedUntil: true,
  mustChangePassword: true,
  version: true,
  employeeId: true,
  employee: { select: { id: true, firstName: true, lastName: true, shortName: true } },
} as const;

export async function listUsers() {
  return db.user.findMany({ select: userListSelect, orderBy: [{ active: "desc" }, { username: "asc" }] });
}

async function assertEmployeeLink(tx: Tx, role: Role, employeeId: string | null | undefined, userId?: string) {
  if (role === "EMPLOYEE" && !employeeId) {
    throw badRequest("Für die Rolle Mitarbeiter muss ein Mitarbeiter-Datensatz verknüpft werden.");
  }
  if (!employeeId) return;
  const emp = await tx.employee.findUnique({ where: { id: employeeId }, include: { user: { select: { id: true, username: true } } } });
  if (!emp) throw badRequest("Der gewählte Mitarbeiter existiert nicht.");
  if (emp.user && emp.user.id !== userId) {
    throw badRequest(`Dieser Mitarbeiter ist bereits mit dem Login "${emp.user.username}" verknüpft.`);
  }
}

/** Verhindert, dass der letzte aktive Admin entfernt wird */
async function assertKeepsAnAdmin(tx: Tx, userId: string) {
  const others = await tx.user.count({ where: { role: "ADMIN", active: true, id: { not: userId } } });
  if (others === 0) throw badRequest("Es muss mindestens ein aktiver Admin bestehen bleiben.");
}

export async function createUser(actorId: string, input: z.infer<typeof createUserSchema>) {
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    await assertEmployeeLink(tx, input.role, input.employeeId);
    const user = await tx.user.create({
      data: {
        username: input.username,
        initials: input.initials ?? null,
        passwordHash,
        role: input.role,
        employeeId: input.employeeId ?? null,
        mustChangePassword: false,
      },
      select: userListSelect,
    });
    await audit(tx, {
      userId: actorId,
      action: "user.create",
      entityType: "User",
      entityId: user.id,
      summary: `Benutzer "${user.username}" (${ROLE_LABELS[input.role]}) angelegt`,
    });
    return user;
  });
}

export async function updateUser(actorId: string, userId: string, input: z.infer<typeof updateUserSchema>) {
  const result = await db.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) throw notFound("Benutzer nicht gefunden.");
    if (current.version !== input.version) throw conflict();

    const role = (input.role ?? current.role) as Role;
    const employeeId = input.employeeId === undefined ? current.employeeId : input.employeeId;
    const active = input.active ?? current.active;

    if (actorId === userId && (active === false || role !== current.role)) {
      throw badRequest("Die eigene Rolle bzw. das eigene Konto kann nicht geändert oder deaktiviert werden.");
    }
    if (current.role === "ADMIN" && current.active && (role !== "ADMIN" || !active)) {
      await assertKeepsAnAdmin(tx, userId);
    }
    await assertEmployeeLink(tx, role, employeeId, userId);

    // Versionsprüfung atomar: nur aktualisieren, wenn die Version noch stimmt
    const updated = await tx.user.updateMany({
      where: { id: userId, version: input.version },
      data: {
        username: input.username ?? current.username,
        ...(input.initials !== undefined ? { initials: input.initials } : {}),
        role,
        employeeId,
        active,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw conflict();

    const changes: string[] = [];
    if (input.username && input.username !== current.username) changes.push(`Benutzername → ${input.username}`);
    if (input.initials !== undefined && input.initials !== current.initials) changes.push(`Kürzel → ${input.initials ?? "–"}`);
    if (role !== current.role) changes.push(`Rolle → ${ROLE_LABELS[role]}`);
    if (employeeId !== current.employeeId) changes.push("Mitarbeiter-Verknüpfung geändert");
    if (active !== current.active) changes.push(active ? "aktiviert" : "deaktiviert");
    await audit(tx, {
      userId: actorId,
      action: "user.update",
      entityType: "User",
      entityId: userId,
      summary: `Benutzer "${current.username}" geändert${changes.length ? ": " + changes.join(", ") : ""}`,
      details: { before: { role: current.role, active: current.active, employeeId: current.employeeId }, after: { role, active, employeeId } },
    });
    return { deactivated: current.active && !active, roleChanged: role !== current.role };
  });

  // Deaktivierte Konten bzw. geänderte Rollen sofort abmelden
  if (result.deactivated || result.roleChanged) await destroyUserSessions(userId);
  return db.user.findUniqueOrThrow({ where: { id: userId }, select: userListSelect });
}

export async function adminResetPassword(actorId: string, userId: string, password: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Benutzer nicht gefunden.");
  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      failedLogins: 0,
      lockedUntil: null,
      version: { increment: 1 },
    },
  });
  await destroyUserSessions(userId);
  await audit(db, {
    userId: actorId,
    action: "user.password_reset",
    entityType: "User",
    entityId: userId,
    summary: `Passwort von "${user.username}" zurückgesetzt`,
  });
}

export async function unlockUser(actorId: string, userId: string) {
  const user = await db.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockedUntil: null },
  });
  await audit(db, {
    userId: actorId,
    action: "user.unlock",
    entityType: "User",
    entityId: userId,
    summary: `Login-Sperre von "${user.username}" aufgehoben`,
  });
}

export async function changeOwnPassword(userId: string, sessionId: string, currentPassword: string, newPassword: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw badRequest("Das aktuelle Passwort ist falsch.");
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, version: { increment: 1 } },
  });
  // Alle anderen Sitzungen dieses Benutzers beenden
  await destroyUserSessions(userId, sessionId);
  await audit(db, {
    userId,
    action: "user.password_change",
    entityType: "User",
    entityId: userId,
    summary: `${user.username} hat das eigene Passwort geändert`,
  });
}
