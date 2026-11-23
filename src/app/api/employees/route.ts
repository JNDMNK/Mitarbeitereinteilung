import { employeeCreateSchema } from "@/lib/masterdata-schemas";
import { can } from "@/lib/roles";
import { apiRoute, parseJson } from "@/server/api";
import { createEmployee, listEmployees } from "@/server/services/masterdata/employees";

// Lesen: alle eingeloggten Benutzer; Login-Namen nur für Admin/Einteiler
export const GET = apiRoute({ permission: "planning.view" }, async ({ session }) => {
  const employees = await listEmployees();
  if (can(session.user.role, "masterdata.edit")) return { employees };
  return {
    employees: employees.map((e) => {
      const { user, ...rest } = e;
      void user;
      return rest;
    }),
  };
});

export const POST = apiRoute({ permission: "masterdata.edit" }, async ({ req, session }) => {
  const input = await parseJson(req, employeeCreateSchema);
  return { employee: await createEmployee(session.user.id, input) };
});
