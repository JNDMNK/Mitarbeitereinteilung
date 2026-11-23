import { settingsSchema } from "@/lib/validation";
import { apiRoute, parseJson } from "@/server/api";
import { getSettings, updateSettings } from "@/server/services/settings";

export const GET = apiRoute({}, async () => {
  const s = await getSettings();
  return { settings: s };
});

export const PATCH = apiRoute({ permission: "admin.settings" }, async ({ req, session }) => {
  const input = await parseJson(req, settingsSchema);
  return { settings: await updateSettings(session.user.id, input) };
});
