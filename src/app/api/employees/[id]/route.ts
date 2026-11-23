import { employeeUpdateSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { updateEmployee } from "@/server/services/masterdata/employees";

export const PATCH = apiRoute<{ id: string }>({ permission: "masterdata.edit" }, async ({ req, params, session }) => {
  const input = await parseJson(req, employeeUpdateSchema);
  return { employee: await updateEmployee(session.user.id, params.id, input) };
});
