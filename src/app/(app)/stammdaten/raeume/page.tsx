import { getSettings } from "@/server/services/settings";
import { can } from "@/lib/roles";
import type { Metadata } from "next";
import { BackLink } from "@/components/masterdata/shared";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PageHeader } from "@/components/page-header";
import { db } from "@/server/db";
import { requirePagePermission } from "@/server/page-auth";
import { listVehicles } from "@/server/services/masterdata/vehicles";
import { VehicleAdmin } from "../fahrzeuge/vehicle-admin";

export const metadata: Metadata = { title: "Räume" };

export default async function RoomsPage() {
  const session = await requirePagePermission("masterdata.edit");
  const settings = await getSettings();
  const canDelete = can(session.user.role, "admin.masterdata");
  const [vehicles, employees, departments] = await Promise.all([
    listVehicles(),
    db.employee.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, shortName: true, qualification: true, department: { select: { id: true, name: true, color: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    db.department.findMany({ where: { active: true }, select: { id: true, name: true, color: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <>
      <LiveRefresh scopes={["masterdata"]} />
      <BackLink />
      <PageHeader title="Räume" description="Orte ohne Fahrzeug, z. B. Lager oder Schulungsraum – Mitarbeiter werden ganztägig eingeteilt." />
      <VehicleAdmin autoDeleteDays={settings.autoDeleteVehicleDays} canDelete={canDelete} vehicles={vehicles} employees={employees} departments={departments} kind="ROOM" />
    </>
  );
}
