import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/roles";
import { requirePagePermission } from "@/server/page-auth";
import { loadAbsenceBoard, type AbsenceSearchParams } from "@/server/services/absence-board-data";
import { AbsenceBoard } from "./absence-board";

export const metadata: Metadata = { title: "Abwesenheiten" };

export default async function AbsencesPage({ searchParams }: { searchParams: Promise<AbsenceSearchParams> }) {
  const { user } = await requirePagePermission("absences.view");
  const data = await loadAbsenceBoard(await searchParams);
  return (
    <>
      <LiveRefresh scopes={["absences", "masterdata"]} />
      <PageHeader title="Abwesenheiten" />
      <AbsenceBoard
        {...data}
        canEdit={can(user.role, "absences.edit")}
        canEditOutages={can(user.role, "planning.edit")}
        ownEmployeeId={user.employeeId}
      />
    </>
  );
}
