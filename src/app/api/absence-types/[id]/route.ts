import { absenceTypeUpdateSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { updateAbsenceType } from "@/server/services/masterdata/departments";

export const PATCH = apiRoute<{ id: string }>({ permission: "admin.masterdata" }, async ({ req, params, session }) => {
  const input = await parseJson(req, absenceTypeUpdateSchema);
  return { absenceType: await updateAbsenceType(session.user.id, params.id, input) };
});
