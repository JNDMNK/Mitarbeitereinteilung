import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live/live-refresh";
import { db } from "@/server/db";
import { requirePagePermission } from "@/server/page-auth";
import { loadAbsenceBoard, type AbsenceSearchParams } from "@/server/services/absence-board-data";
import { logoUrl } from "@/server/services/settings";
import { AbsenceBoard } from "../../(app)/abwesenheiten/absence-board";
import { DisplayHeader } from "../display-header";

export const metadata: Metadata = { title: "Abwesenheiten · Anzeige" };

/** Monitor: Abwesenheitskalender nur zum Ansehen */
export default async function DisplayAbsencesPage({ searchParams }: { searchParams: Promise<AbsenceSearchParams & { tage?: string }> }) {
  const session = await requirePagePermission("display.view");
  const sp = await searchParams;
  const count = sp.tage === "5" ? 5 : 3;
  const [data, settings] = await Promise.all([
    loadAbsenceBoard(sp),
    db.appSettings.findUnique({ where: { id: 1 }, select: { companyName: true, logoFile: true } }),
  ]);
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <meta name="csrf-token" content={session.csrfToken} />
      <LiveRefresh scopes={["absences", "masterdata"]} fallbackMs={60_000} />
      <DisplayHeader
        companyName={settings?.companyName ?? "Einteilung"}
        logoUrl={logoUrl(settings?.logoFile ?? null)}
        count={count}
        mode="absences"
        today={data.today}
        canLeave={session.user.role !== "DISPLAY"}
        homeHref={`/anzeige?tage=${count}`}
      />
      <main className="p-3 md:p-4">
        <AbsenceBoard {...data} canEdit={false} canEditOutages={false} ownEmployeeId={null} basePath={`/anzeige/abwesenheiten${count === 5 ? "?tage=5" : ""}`} />
      </main>
    </div>
  );
}
