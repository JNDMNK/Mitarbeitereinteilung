import type { Metadata } from "next";
import { PlanningBoard } from "@/components/planning/planning-board";
import { isIsoDate, todayIso } from "@/lib/dates";
import { normalizeStart, visibleDays } from "@/lib/planning-days";
import { can } from "@/lib/roles";
import { requirePagePermission } from "@/server/page-auth";
import { getPlanningData } from "@/server/services/planning";

export const metadata: Metadata = { title: "Planung" };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ datum?: string }> }) {
  const { user } = await requirePagePermission("planning.view");
  const { datum } = await searchParams;
  const today = todayIso();
  const start = normalizeStart(isIsoDate(datum) ? datum : today, user.hideWeekends);
  const days = visibleDays(start, user.hideWeekends);
  const initialData = await getPlanningData(days[0], days[days.length - 1]);

  return (
    <PlanningBoard
      initialStart={start}
      initialData={initialData}
      today={today}
      canEdit={can(user.role, "planning.edit")}
      ownEmployeeId={user.employeeId}
      hideWeekends={user.hideWeekends}
      planningView={user.planningView === "timeline" ? "timeline" : "cards"}
      hiddenDepartments={user.hiddenDepartments}
    />
  );
}
