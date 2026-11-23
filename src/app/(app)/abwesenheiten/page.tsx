import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { monthEnd, monthStart, todayIso } from "@/lib/dates";
import { can } from "@/lib/roles";
import { db } from "@/server/db";
import { requirePagePermission } from "@/server/page-auth";
import { listAbsencesInRange } from "@/server/services/absences";
import { AbsenceBoard } from "./absence-board";

export const metadata: Metadata = { title: "Abwesenheiten" };

export default async function AbsencesPage({ searchParams }: { searchParams: Promise<{ monat?: string; abteilung?: string; ansicht?: string }> }) {
  const { user } = await requirePagePermission("absences.view");
  const sp = await searchParams;
  const today = todayIso();
  const month = sp.monat && /^\d{4}-\d{2}$/.test(sp.monat) ? `${sp.monat}-01` : monthStart(today);
  const from = monthStart(month);
  const to = monthEnd(month);

  const [absences, departments, types] = await Promise.all([
    listAbsencesInRange(from, to),
    db.department.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true, sortOrder: true } }),
    db.absenceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, color: true, active: true } }),
  ]);
  const withAbsence = new Set(absences.map((a) => a.employeeId));
  const employees = await db.employee.findMany({
    // aktive Mitarbeiter + inaktive, die im Monat noch Abwesenheiten haben (Historie)
    where: { OR: [{ active: true }, { id: { in: [...withAbsence] } }] },
    select: { id: true, firstName: true, lastName: true, shortName: true, active: true, department: { select: { id: true, name: true, color: true, sortOrder: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <>
      <PageHeader title="Abwesenheiten" />
      <AbsenceBoard
        from={from}
        to={to}
        today={today}
        departmentFilter={sp.abteilung ?? ""}
        view={sp.ansicht === "liste" ? "list" : "table"}
        canEdit={can(user.role, "absences.edit")}
        ownEmployeeId={user.employeeId}
        absences={absences}
        departments={departments}
        types={types}
        employees={employees}
      />
    </>
  );
}
