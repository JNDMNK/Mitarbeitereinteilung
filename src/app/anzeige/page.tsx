import type { Metadata } from "next";
import { todayIso } from "@/lib/dates";
import { buildDisplayDays } from "@/lib/display-view";
import { normalizeStart, stepDay, visibleDays } from "@/lib/planning-days";
import { requirePagePermission } from "@/server/page-auth";
import { db } from "@/server/db";
import { getPlanningData } from "@/server/services/planning";
import { logoUrl } from "@/server/services/settings";
import { DisplayBoard } from "./display-board";

export const metadata: Metadata = { title: "Anzeige" };

/** Monitor-Ansicht: 3 oder 5 Arbeitstage, nur lesen, passt sich der Bildschirmhöhe an */
export default async function DisplayPage({ searchParams }: { searchParams: Promise<{ tage?: string; datum?: string; frei?: string }> }) {
  const session = await requirePagePermission("display.view");
  const sp = await searchParams;
  const count = sp.tage === "5" ? 5 : 3;
  const free = sp.frei === "anzahl" || sp.frei === "aus" ? sp.frei : "namen";
  const freeQ = free !== "namen" ? `&frei=${free}` : "";
  const today = todayIso();
  // Wochenende und Feiertage werden übersprungen
  const start = normalizeStart(sp.datum && /^\d{4}-\d{2}-\d{2}$/.test(sp.datum) ? sp.datum : today, true);
  const days = visibleDays(start, true, count);
  const link = (d: string) => `/anzeige?tage=${count}${d === normalizeStart(today, true) ? "" : `&datum=${d}`}${freeQ}`;
  const nav = { prev: link(stepDay(start, -1, true)), next: link(stepDay(start, 1, true)), isToday: start === normalizeStart(today, true), start };
  const [data, settings] = await Promise.all([
    getPlanningData(days[0], days[days.length - 1]),
    db.appSettings.findUnique({ where: { id: 1 }, select: { companyName: true, logoFile: true } }),
  ]);
  return (
    <DisplayBoard
      days={buildDisplayDays(data, days, today)}
      count={count}
      today={today}
      companyName={settings?.companyName ?? "Einteilung"}
      logoUrl={logoUrl(settings?.logoFile ?? null)}
      canLeave={session.user.role !== "DISPLAY"}
      nav={nav}
      free={free}
    />
  );
}
