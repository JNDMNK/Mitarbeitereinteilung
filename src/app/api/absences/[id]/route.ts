import { absenceDeleteSchema, absenceUpdateSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { deleteAbsence, updateAbsence } from "@/server/services/absences";

export const PATCH = apiRoute<{ id: string }>({ permission: "absences.edit" }, async ({ req, params, session }) => {
  const input = await parseJson(req, absenceUpdateSchema);
  return updateAbsence(session.user.id, params.id, input);
});

export const DELETE = apiRoute<{ id: string }>({ permission: "absences.edit" }, async ({ req, params, session }) => {
  const { version } = await parseJson(req, absenceDeleteSchema);
  await deleteAbsence(session.user.id, params.id, version);
  return { ok: true };
});
