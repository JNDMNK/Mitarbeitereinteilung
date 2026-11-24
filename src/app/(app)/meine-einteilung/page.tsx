import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PageHeader, Placeholder } from "@/components/page-header";
import { QualificationBadge } from "@/components/qualification-badge";
import { addDays, formatDayLong, formatRange, mapsUrl, navigationUrl, todayIso } from "@/lib/dates";
import { timeRange } from "@/lib/planning-logic";
import { requirePagePermission } from "@/server/page-auth";
import { getMyAssignments, type MyDay } from "@/server/services/my-assignments";

export const metadata: Metadata = { title: "Meine Einteilung" };

function dayTitle(date: string, today: string) {
  if (date === today) return "Heute";
  if (date === addDays(today, 1)) return "Morgen";
  return null;
}

export default async function MyAssignmentsPage() {
  const { user } = await requirePagePermission("planning.view");
  if (!user.employeeId) {
    return (
      <>
        <PageHeader title="Meine Einteilung" />
        <Placeholder text="Ihr Benutzerkonto ist mit keinem Mitarbeiter verknüpft. Bitte an die Verwaltung wenden." />
      </>
    );
  }
  const today = todayIso();
  const days = await getMyAssignments(user.employeeId, today, 7);
  const [first, ...rest] = days;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <LiveRefresh scopes={["planning", "absences", "masterdata"]} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Meine Einteilung</h1>
          <p className="text-muted">
            {user.employee?.firstName} {user.employee?.lastName}
          </p>
        </div>
        <Link href={`/planung?datum=${today}`} className="flex min-h-11 items-center rounded-lg border border-line bg-white px-4 font-semibold hover:bg-slate-50">
          Gesamtansicht →
        </Link>
      </div>

      <DayCard day={first} today={today} big />
      {rest.length > 0 && <h2 className="pt-2 text-lg font-bold">Die nächsten Tage</h2>}
      {rest.map((d) => (
        <DayCard key={d.date} day={d} today={today} />
      ))}
    </div>
  );
}

function DayCard({ day, today, big = false }: { day: MyDay; today: string; big?: boolean }) {
  const title = dayTitle(day.date, today);
  const assigned = !!day.vehicle;
  return (
    <article className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${big ? "ring-2 ring-brand-600" : "ring-line"}`} aria-label={formatDayLong(day.date)}>
      <header className={`flex items-baseline justify-between gap-2 px-4 py-2 ${big ? "bg-brand-700 text-white" : "bg-slate-100"}`}>
        <h2 className={big ? "text-xl font-bold" : "text-lg font-bold"}>
          {title ? `${title}, ` : ""}
          {formatDayLong(day.date)}
        </h2>
      </header>

      <div className="space-y-3 p-4">
        {day.absence && (
          <div className="flex items-center gap-3 rounded-xl p-3 text-white" style={{ backgroundColor: day.absence.type.color }}>
            <span className="rounded-lg bg-white/25 px-2 py-1 font-mono text-lg font-bold">{day.absence.type.code}</span>
            <div>
              <p className="text-lg font-bold">{day.absence.type.name}</p>
              <p className="text-sm opacity-90">
                {formatRange(day.absence.startDate, day.absence.endDate)}
                {day.absence.withVehicle ? " · mit Fahrzeug" : ""}
                {day.absence.note ? ` · ${day.absence.note}` : ""}
              </p>
            </div>
          </div>
        )}
        {day.absence && assigned && (
          <p className="rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">⚠ Trotz Abwesenheit eingeteilt – bitte mit dem Einteiler klären.</p>
        )}

        {!assigned && !day.absence && <p className="text-lg text-muted">Noch nicht eingeteilt.</p>}

        {day.vehicle && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted">Fahrzeug</span>
              <span className="rounded-md border-2 border-ink px-2 font-mono text-lg font-bold tracking-wide">{day.vehicle.licensePlate}</span>
              <span className="text-lg font-semibold">{day.vehicle.name}</span>
              {day.vehicle.isDefaultDriver && <span className="rounded-full bg-ink px-2 text-sm font-bold text-white">Ihr Fahrzeug</span>}
              {day.vehicle.owner && <span className="text-sm text-muted">(Fahrzeug von {day.vehicle.owner})</span>}
            </div>

            {day.sites.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-muted">Baustelle noch nicht festgelegt.</p>
            ) : (
              <ol className="space-y-2">
                {day.sites.map((s) => (
                  <li key={`${s.id}-${s.startMin}`} className="rounded-xl border border-line p-3" style={{ borderLeft: `8px solid ${s.color}` }}>
                    <p className={`font-mono font-bold ${big ? "text-2xl" : "text-xl"}`}>{timeRange(s.startMin, s.endMin)}</p>
                    <p className={`font-bold ${big ? "text-xl" : "text-lg"}`}>{s.name}</p>
                    {(s.customer || s.orderNumber) && <p className="text-sm text-muted">{[s.customer, s.orderNumber && `Auftrag ${s.orderNumber}`].filter(Boolean).join(" · ")}</p>}
                    {s.address && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a href={mapsUrl(s.address)} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                          📍 {s.address}
                        </a>
                        <a
                          href={navigationUrl(s.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto flex min-h-12 items-center rounded-lg bg-brand-700 px-4 font-bold text-white hover:bg-brand-800"
                        >
                          🧭 Navigation starten
                        </a>
                      </div>
                    )}
                    {s.assignmentNote && <p className="mt-1 text-sm font-semibold">Hinweis: {s.assignmentNote}</p>}
                    {s.note && <p className="mt-1 text-sm text-muted italic">{s.note}</p>}
                  </li>
                ))}
              </ol>
            )}

            <div>
              <p className="mb-1 text-sm font-semibold text-muted">{day.colleagues.length ? "Sie fahren zusammen mit" : "Keine Mitfahrer"}</p>
              <ul className="space-y-1.5">
                {day.colleagues.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-semibold">
                      {c.firstName} {c.lastName}
                    </span>
                    <QualificationBadge q={c.qualification} />
                    {c.isDriver && <span className="rounded-full bg-ink px-2 text-xs font-bold text-white">Fahrer</span>}
                    {c.absent && <span className="text-xs font-bold text-red-700">abwesend</span>}
                    {c.phone && (
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="ml-auto flex min-h-10 items-center rounded-lg border border-line bg-white px-3 font-semibold text-brand-700">
                        📞 {c.phone}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
