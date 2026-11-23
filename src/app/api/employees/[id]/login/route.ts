import { employeeLoginSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { manageEmployeeLogin } from "@/server/services/masterdata/employees";

// Einteiler und Admins: Login (Rolle Mitarbeiter) nachträglich anlegen bzw. freischalten
export const POST = apiRoute<{ id: string }>({ permission: "masterdata.edit" }, async ({ req, params, session }) => {
  const input = await parseJson(req, employeeLoginSchema);
  return manageEmployeeLogin({ id: session.user.id, role: session.user.role }, params.id, input);
});
