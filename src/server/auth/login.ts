import "server-only";
import { LOCK_MINUTES, LOGIN_RATE_LIMIT, MAX_FAILED_LOGINS } from "@/lib/constants";
import { homePathFor, isRole } from "@/lib/roles";
import { audit } from "../audit";
import { db } from "../db";
import { ApiError, tooManyRequests } from "../errors";
import { verifyDummy, verifyPassword } from "./password";
import { RateLimiter } from "./rate-limit";
import { createSession } from "./session";

const globalForLimiter = globalThis as unknown as { loginLimiter?: RateLimiter };
const ipLimiter = (globalForLimiter.loginLimiter ??= new RateLimiter(
  LOGIN_RATE_LIMIT.limit,
  LOGIN_RATE_LIMIT.windowMs,
));

const INVALID = "Benutzername oder Passwort ist falsch.";

function minutesText(ms: number) {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m === 1 ? "einer Minute" : `${m} Minuten`;
}

export async function login(input: {
  username: string;
  password: string;
  ip: string;
  userAgent?: string;
}): Promise<{ redirectTo: string }> {
  // Nur Fehlversuche zählen. Ohne bekannte IP (TRUST_PROXY nicht gesetzt)
  // würden sich sonst alle Benutzer einen Zähler teilen -> dann greift nur
  // die Sperre pro Benutzerkonto.
  const ipKey = input.ip !== "unbekannt" ? `ip:${input.ip}` : null;
  const rl = ipKey ? ipLimiter.check(ipKey) : { ok: true, retryAfterMs: 0 };
  if (!rl.ok) {
    throw tooManyRequests(`Zu viele Anmeldeversuche. Bitte in ${minutesText(rl.retryAfterMs)} erneut versuchen.`);
  }

  const user = await db.user.findUnique({ where: { username: input.username } });
  if (!user) {
    await verifyDummy(input.password);
    if (ipKey) ipLimiter.hit(ipKey);
    await audit(db, {
      userId: null,
      action: "auth.login_failed",
      entityType: "User",
      summary: `Fehlgeschlagener Login für unbekannten Benutzer "${input.username.slice(0, 50)}" (IP ${input.ip})`,
    });
    throw new ApiError(401, INVALID, "invalid_credentials");
  }

  const now = Date.now();
  if (user.lockedUntil && user.lockedUntil.getTime() > now) {
    throw new ApiError(
      423,
      `Zu viele Fehlversuche. Das Konto ist für ${minutesText(user.lockedUntil.getTime() - now)} gesperrt.`,
      "locked",
    );
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    if (ipKey) ipLimiter.hit(ipKey);
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: lock
        ? { failedLogins: 0, lockedUntil: new Date(now + LOCK_MINUTES * 60_000) }
        : { failedLogins: failed },
    });
    await audit(db, {
      userId: user.id,
      action: lock ? "auth.locked" : "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      summary: lock
        ? `Konto "${user.username}" nach ${MAX_FAILED_LOGINS} Fehlversuchen für ${LOCK_MINUTES} Minuten gesperrt (IP ${input.ip})`
        : `Fehlgeschlagener Login für "${user.username}" (IP ${input.ip})`,
    });
    if (lock) {
      throw new ApiError(423, `Zu viele Fehlversuche. Das Konto ist für ${LOCK_MINUTES} Minuten gesperrt.`, "locked");
    }
    throw new ApiError(401, INVALID, "invalid_credentials");
  }

  if (!user.active || !isRole(user.role)) {
    throw new ApiError(403, "Dieses Konto ist deaktiviert. Bitte an die Verwaltung wenden.", "inactive");
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(now) },
  });
  await createSession(user.id, { ip: input.ip, userAgent: input.userAgent });
  await audit(db, {
    userId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    summary: `${user.username} hat sich angemeldet`,
  });

  return { redirectTo: user.mustChangePassword ? "/passwort-aendern" : homePathFor(user.role) };
}
