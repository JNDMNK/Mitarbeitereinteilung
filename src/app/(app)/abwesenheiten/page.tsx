import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PageHeader } from "@/components/page-header";
import { monthEnd, monthStart, todayIso } from "@/lib/dates";
import { can } from "@/lib/roles";
import { db } from "@/server/db";
import { requirePagePermission } from "@/server/page-auth";
import { listAbsencesInRange } from "@/server/services/absences";
import { AbsenceBoard } from "./absence-board";
import { listOutages } from "@/server/services/vehicle-outages";

export const metadata: Metadata = { title: "Abwesenheiten" };

export default async function AbsencesPage({ searchParams }: { searchParams: Promise<{ monat?: string; abteilung?: string; ansicht?: string }> }) {
  const { user } = await requirePagePermission("absences.view");
  const sp = await searchParams;
  const today = todayIso();
  const month = sp.monat && /^\d{4}-\d{2}$/.test(sp.monat) ? `${sp.monat}-01` : monthStart(today);
  const from = monthStart(month);
  const to = monthEnd(month);

  const [absences, outages, vehicles, departments, types] = await Promise.all([
    listAbsencesInRange(from, to),
    listOutages(from, to),
    db.vehicle.findMany({
      where: { kind: "VEHICLE", active: true },
      select: { id: true, licensePlate: true, name: true, defaultDriverId: true, departmentId: true, defaultDriver: { select: { departmentId: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.department.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true, sortOrder: true } }),
    db.absenceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, color: true, active: true } }),
  ]);
  const withAbsence = new Set(absences.map((a) => a.employeeId));
  const owned = await db.vehicle.findMany({ where: { active: true, defaultDriverId: { not: null } }, select: { defaultDriverId: true, licensePlate: true } });
  const ownedVehicles: Record<string, string[]> = {};
  for (const v of owned) (ownedVehicles[v.defaultDriverId!] ??= []).push(v.licensePlate);
  const employees = await db.employee.findMany({
    // aktive Mitarbeiter + inaktive, die im Monat noch Abwesenheiten haben (Historie)
    // aktive Mitarbeiter, deren Zeitraum im Betrieb den Monat berührt, + Historie
    where: {
      OR: [
        {
          active: true,
          AND: [{ OR: [{ availableFrom: null }, { availableFrom: { lte: to } }] }, { OR: [{ availableUntil: null }, { availableUntil: { gte: from } }] }],
        },
        { id: { in: [...withAbsence] } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      shortName: true,
      active: true,
      availableFrom: true,
      availableUntil: true,
      qualification: true,
      department: { select: { id: true, name: true, color: true, sortOrder: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <>
      <LiveRefresh scopes={["absences", "masterdata"]} />
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
        ownedVehicles={ownedVehicles}
        canEditOutages={can(user.role, "planning.edit")}
        outages={outages}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          licensePlate: v.licensePlate,
          name: v.name,
          ownerId: v.defaultDriverId,
          departmentId: v.departmentId ?? v.defaultDriver?.departmentId ?? null,
        }))}
      />
    </>
  );
}
