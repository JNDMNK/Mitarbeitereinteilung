import { departmentSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { createDepartment, listDepartments } from "@/server/services/masterdata/departments";

// Lesen: alle eingeloggten Benutzer (wird für Planung/Anzeige gebraucht)
export const GET = apiRoute({ permission: "planning.view" }, async () => ({ departments: await listDepartments() }));

export const POST = apiRoute({ permission: "admin.masterdata" }, async ({ req, session }) => {
  const input = await parseJson(req, departmentSchema);
  return { department: await createDepartment(session.user.id, input) };
});
