import { userPrefsSchema } from "@/lib/validation";
import { apiRoute, parseJson } from "@/server/api";
import { db } from "@/server/db";

export const PATCH = apiRoute({}, async ({ req, session }) => {
  const input = await parseJson(req, userPrefsSchema);
  const { hiddenDepartments, ...rest } = input;
  const user = await db.user.update({
    where: { id: session.user.id },
    data: { ...rest, ...(hiddenDepartments ? { hiddenDepartments: [...new Set(hiddenDepartments)].join(",") } : {}) },
    select: { hideWeekends: true, planningView: true, hiddenDepartments: true },
  });
  return { ...user, hiddenDepartments: user.hiddenDepartments.split(",").filter(Boolean) };
});
