import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_TTL_DAYS } from "@/lib/constants";
import { isRole, type Role } from "@/lib/roles";
import { db } from "../db";
import { env } from "../env";

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 60 * 60 * 1000; // DB-Ablauf höchstens stündlich verlängern

export function sessionCookieName(): string {
  // __Host- erzwingt Secure, Path=/ und keine Domain -> nicht von Subdomains setzbar
  return env().secureCookies ? "__Host-einteilung" : "einteilung_session";
}

function hashToken(token: string): string {
  return createHmac("sha256", env().sessionSecret).update(token).digest("hex");
}

export function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env().secureCookies,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export type SessionUser = {
  id: string;
  username: string;
  role: Role;
  employeeId: string | null;
  mustChangePassword: boolean;
  hideWeekends: boolean;
  planningView: string;
  hiddenDepartments: string[];
  employee: { id: string; firstName: string; lastName: string; shortName: string } | null;
};

export type CurrentSession = {
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
  /** true, wenn das Ablaufdatum verlängert wurde (Cookie neu setzen) */
  refreshed: boolean;
  user: SessionUser;
};

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS);
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      csrfToken,
      expiresAt,
      ip: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, cookieOptions(expiresAt));
  return { csrfToken, expiresAt };
}

/** Liest und prüft die Sitzung aus dem Cookie. Pro Request nur einmal (React cache). */
export const getSession = cache(async (): Promise<CurrentSession | null> => {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token || token.length > 200) return null;

  const id = hashToken(token);
  const row = await db.session.findUnique({
    where: { id },
    include: {
      user: {
        include: { employee: { select: { id: true, firstName: true, lastName: true, shortName: true } } },
      },
    },
  });
  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt.getTime() <= now || !row.user.active || !isRole(row.user.role)) {
    await db.session.delete({ where: { id } }).catch(() => {});
    return null;
  }

  let expiresAt = row.expiresAt;
  let refreshed = false;
  if (now - row.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    expiresAt = new Date(now + SESSION_TTL_DAYS * DAY_MS);
    refreshed = true;
    await db.session
      .update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt } })
      .catch(() => {});
  }

  const u = row.user;
  return {
    sessionId: id,
    csrfToken: row.csrfToken,
    expiresAt,
    refreshed,
    user: {
      id: u.id,
      username: u.username,
      role: u.role as Role,
      employeeId: u.employeeId,
      mustChangePassword: u.mustChangePassword,
      hideWeekends: u.hideWeekends,
      planningView: u.planningView,
      hiddenDepartments: u.hiddenDepartments.split(",").filter(Boolean),
      employee: u.employee,
    },
  };
});

/** Cookie mit verlängertem Ablauf neu setzen (nur in Route Handlern möglich) */
export async function refreshSessionCookie(session: CurrentSession) {
  if (!session.refreshed) return;
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) jar.set(sessionCookieName(), token, cookieOptions(session.expiresAt));
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) {
    await db.session.deleteMany({ where: { id: hashToken(token) } });
  }
  jar.set(sessionCookieName(), "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

export async function destroyUserSessions(userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Abgelaufene Sitzungen aufräumen (beim Start und gelegentlich) */
export async function purgeExpiredSessions() {
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
