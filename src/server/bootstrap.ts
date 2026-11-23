import "server-only";
import { db } from "./db";
import { env } from "./env";
import { hashPassword } from "./auth/password";
import { purgeExpiredSessions } from "./auth/session";
import { audit } from "./audit";
import { ensureDefaultDepartment, seedBase, seedDemo } from "./seed-data";
import { autoBackupIfDue } from "./services/backup";

/**
 * Wird beim Serverstart ausgeführt (instrumentation.ts):
 *  - Einstellungs-Zeile anlegen
 *  - ersten Admin aus INITIAL_ADMIN_USER / INITIAL_ADMIN_PASSWORD anlegen,
 *    wenn noch kein Benutzer existiert
 *  - abgelaufene Sitzungen löschen
 */
export async function bootstrap() {
  // Grunddaten bei Neuinstallation (Abwesenheitsarten, Einstellungen)
  if ((await db.absenceType.count()) === 0) {
    await seedBase(db);
    console.log("[bootstrap] Abwesenheitsarten angelegt.");
  }
  await db.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  // Optionale Demodaten (ohne Test-Logins) zum Ausprobieren: SEED_DEMO=1
  if (process.env.SEED_DEMO === "1" && (await db.employee.count()) === 0) {
    await seedDemo(db, { withLogins: false });
    console.log("[bootstrap] Demodaten angelegt (Mitarbeiter, Fahrzeuge, Baustellen).");
  }
  await ensureDefaultDepartment(db);

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

  // Tägliche automatische Datensicherung nach DATA_DIR/backups (letzte 14 Tage)
  const runBackup = () => void autoBackupIfDue().catch((err) => console.error("[backup] Automatische Sicherung fehlgeschlagen:", err));
  setTimeout(runBackup, 60_000).unref();
  setInterval(runBackup, 6 * 60 * 60 * 1000).unref();

  await purgeExpiredSessions();
  setInterval(() => void purgeExpiredSessions().catch(() => {}), 6 * 60 * 60 * 1000).unref();
}
