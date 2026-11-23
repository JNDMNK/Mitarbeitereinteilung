import type { Metadata } from "next";
import { ColorEntityAdmin } from "@/components/masterdata/color-entity-admin";
import { BackLink } from "@/components/masterdata/shared";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/page-auth";
import { listDepartments } from "@/server/services/masterdata/departments";

export const metadata: Metadata = { title: "Abteilungen" };

export default async function DepartmentsPage() {
  await requirePagePermission("admin.masterdata");
  const deps = await listDepartments();
  return (
    <>
      <LiveRefresh scopes={["masterdata"]} />
      <BackLink />
      <PageHeader title="Abteilungen" description="Die Farbe erscheint an den Mitarbeiter-Chips in der Planung." />
      <ColorEntityAdmin
        endpoint="/api/departments"
        singular="Abteilung"
        items={deps.map((d) => ({
          id: d.id,
          name: d.name,
          color: d.color,
          sortOrder: d.sortOrder,
          active: d.active,
          version: d.version,
          info: `${d._count.employees} aktive Mitarbeiter`,
        }))}
      />
    </>
  );
}
