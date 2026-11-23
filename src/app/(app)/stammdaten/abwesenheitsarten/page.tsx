import type { Metadata } from "next";
import { ColorEntityAdmin } from "@/components/masterdata/color-entity-admin";
import { BackLink } from "@/components/masterdata/shared";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/page-auth";
import { listAbsenceTypes } from "@/server/services/masterdata/departments";

export const metadata: Metadata = { title: "Abwesenheitsarten" };

export default async function AbsenceTypesPage() {
  await requirePagePermission("admin.masterdata");
  const types = await listAbsenceTypes();
  return (
    <>
      <LiveRefresh scopes={["masterdata"]} />
      <BackLink />
      <PageHeader title="Abwesenheitsarten" description="Kürzel und Farbe erscheinen in der Abwesenheitsübersicht und in der Planung." />
      <ColorEntityAdmin endpoint="/api/absence-types" singular="Abwesenheitsart" withCode items={types} />
    </>
  );
}
