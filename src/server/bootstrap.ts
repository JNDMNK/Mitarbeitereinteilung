import "server-only";
import { db } from "./db";
import { env } from "./env";
import { hashPassword } from "./auth/password";
import { purgeExpiredSessions } from "./auth/session";
import { audit } from "./audit";

/**
 * Wird beim Serverstart ausgeführt (instrumentation.ts):
 *  - Einstellungs-Zeile anlegen
 *  - ersten Admin aus INITIAL_ADMIN_USER / INITIAL_ADMIN_PASSWORD anlegen,
 *    wenn noch kein Benutzer existiert
 *  - abgelaufene Sitzungen löschen
 */
export async function bootstrap() {
  await db.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const userCount = await db.user.count();
  if (userCount === 0) {
    const { initialAdminUser, initialAdminPassword } = env();
    if (initialAdminUser && initialAdminPassword) {
      if (initialAdminPassword.length < 10) {
        console.warn("[bootstrap] INITIAL_ADMIN_PASSWORD ist kürzer als 10 Zeichen – Admin wird trotzdem angelegt, bitte sofort ändern.");
      }
      const admin = await db.user.create({
        data: {
          username: initialAdminUser.trim().toLowerCase(),
          passwordHash: await hashPassword(initialAdminPassword),
          role: "ADMIN",
          mustChangePassword: true,
        },
      });
      await audit(db, {
        userId: null,
        action: "user.create",
        entityType: "User",
        entityId: admin.id,
        summary: `Erster Admin "${admin.username}" beim Start angelegt`,
      });
      console.log(`[bootstrap] Erster Admin "${admin.username}" angelegt. Passwortänderung beim ersten Login erforderlich.`);
    } else {
      console.warn("[bootstrap] Keine Benutzer vorhanden und INITIAL_ADMIN_USER/INITIAL_ADMIN_PASSWORD nicht gesetzt.");
    }
  }

  await purgeExpiredSessions();
  setInterval(() => void purgeExpiredSessions().catch(() => {}), 6 * 60 * 60 * 1000).unref();
}
