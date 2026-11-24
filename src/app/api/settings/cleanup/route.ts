import { cleanupSettingsSchema } from "@/lib/validation";
import { apiRoute, parseJson } from "@/server/api";
import { runAutoCleanup } from "@/server/services/auto-cleanup";
import { updateCleanupSettings } from "@/server/services/settings";

/** Fristen für das automatische Löschen speichern */
export const PATCH = apiRoute({ permission: "admin.settings" }, async ({ req, session }) => {
  const input = await parseJson(req, cleanupSettingsSchema);
  const settings = await updateCleanupSettings(session.user.id, input);
  // Neue Fristen sofort anwenden
  const result = await runAutoCleanup();
  return { settings, result };
});
