import type { Metadata } from "next";
import { BackLink } from "@/components/masterdata/shared";
import { PageHeader } from "@/components/page-header";
import { db } from "@/server/db";
import { requirePagePermission } from "@/server/page-auth";
import { listEmployees } from "@/server/services/masterdata/employees";
import { EmployeeAdmin } from "./employee-admin";

export const metadata: Metadata = { title: "Mitarbeiter" };

export default async function EmployeesPage() {
  await requirePagePermission("masterdata.edit");
  const [employees, departments, usernames] = await Promise.all([
    listEmployees(),
    db.department.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true, active: true } }),
    db.user.findMany({ select: { username: true } }),
  ]);
  return (
    <>
      <BackLink />
      <PageHeader title="Mitarbeiter" description="Die Personen, die auf Fahrzeuge eingeteilt werden" />
      <EmployeeAdmin employees={employees} departments={departments} takenUsernames={usernames.map((u) => u.username)} />
    </>
  );
}
