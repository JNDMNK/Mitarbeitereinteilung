import { departmentUpdateSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { updateDepartment } from "@/server/services/masterdata/departments";

export const PATCH = apiRoute<{ id: string }>({ permission: "admin.masterdata" }, async ({ req, params, session }) => {
  const input = await parseJson(req, departmentUpdateSchema);
  return { department: await updateDepartment(session.user.id, params.id, input) };
});
