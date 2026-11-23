import { diffDays } from "@/lib/dates";
import { absenceCreateSchema, absenceQuerySchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { badRequest } from "@/server/errors";
import { createAbsence, listAbsencesInRange } from "@/server/services/absences";

export const GET = apiRoute({ permission: "absences.view" }, async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = absenceQuerySchema.parse({ from: sp.get("from"), to: sp.get("to") });
  if (to < from || diffDays(from, to) > 400) throw badRequest("Ungültiger Zeitraum.");
  return { absences: await listAbsencesInRange(from, to) };
});

export const POST = apiRoute({ permission: "absences.edit" }, async ({ req, session }) => {
  const input = await parseJson(req, absenceCreateSchema);
  return createAbsence(session.user.id, input);
});
