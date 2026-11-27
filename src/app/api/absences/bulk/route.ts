import { absenceBulkSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { createAbsencesBulk } from "@/server/services/absences";

/** Gleiche Abwesenheit für mehrere Mitarbeiter auf einmal */
export const POST = apiRoute({ permission: "absences.edit" }, async ({ req, session }) => {
  const input = await parseJson(req, absenceBulkSchema);
  return createAbsencesBulk(session.user.id, input);
});
