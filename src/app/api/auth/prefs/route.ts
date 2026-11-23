import { userPrefsSchema } from "@/lib/validation";
import { apiRoute, parseJson } from "@/server/api";
import { db } from "@/server/db";

export const PATCH = apiRoute({}, async ({ req, session }) => {
  const input = await parseJson(req, userPrefsSchema);
  const user = await db.user.update({
    where: { id: session.user.id },
    data: input,
    select: { hideWeekends: true, planningView: true },
  });
  return user;
});
