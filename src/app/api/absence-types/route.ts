import { absenceTypeSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { createAbsenceType, listAbsenceTypes } from "@/server/services/masterdata/departments";

// Lesen: alle eingeloggten Benutzer (wird für Planung/Anzeige gebraucht)
export const GET = apiRoute({ permission: "planning.view" }, async () => ({ absenceTypes: await listAbsenceTypes() }));

export const POST = apiRoute({ permission: "admin.masterdata" }, async ({ req, session }) => {
  const input = await parseJson(req, absenceTypeSchema);
  return { absenceType: await createAbsenceType(session.user.id, input) };
});
