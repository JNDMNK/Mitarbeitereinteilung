import { employeeUpdateSchema } from "@/lib/masterdata-schemas";
import { versionSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { updateEmployee } from "@/server/services/masterdata/employees";
import { deleteEmployee } from "@/server/services/masterdata/employees";

export const PATCH = apiRoute<{ id: string }>({ permission: "masterdata.edit" }, async ({ req, params, session }) => {
  const input = await parseJson(req, employeeUpdateSchema);
  return { employee: await updateEmployee(session.user.id, params.id, input) };
});

/** Endgültig löschen – nur Admin, nur deaktivierte Einträge */
export const DELETE = apiRoute<{ id: string }>({ permission: "admin.masterdata" }, async ({ req, params, session }) => {
  const { version } = await parseJson(req, versionSchema);
  return deleteEmployee(session.user.id, params.id, version);
});
