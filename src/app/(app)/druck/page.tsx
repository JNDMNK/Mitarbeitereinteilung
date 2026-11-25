/* eslint-disable @next/next/no-img-element -- Logo aus /api/logo */
import type { Metadata } from "next";
import { QUALIFICATION_BADGES, type Qualification } from "@/lib/constants";
import { holidayName } from "@/lib/holidays";
import { formatDateTimeShort, formatDayLong, isoWeek, formatRange, isIsoDate, todayIso } from "@/lib/dates";
import { visibleDays } from "@/lib/planning-days";
import { fixedLabel, timeRange } from "@/lib/planning-logic";
import type { PEmployee } from "@/lib/planning-types";
import { buildDay, buildIndexes, filterDayByDepartments, type DayView, type Indexes } from "@/lib/planning-view";
import { requirePagePermission } from "@/server/page-auth";
import { getPlanningData } from "@/server/services/planning";
import { getSettings, logoUrl } from "@/server/services/settings";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Druckansicht" };

export default async function PrintPage({ searchParams }: { searchParams: Promise<{ datum?: string; tage?: string }> }) {
  const { user } = await requirePagePermission("planning.view");
  const sp = await searchParams;
  const start = isIsoDate(sp.datum) ? sp.datum : todayIso();
  const count = sp.tage === "3" ? 3 : 1;
  const days = visibleDays(start, user.hideWeekends && count > 1, count);
  const [data, settings] = await Promise.all([getPlanningData(days[0], days[days.length - 1]), getSettings()]);
  const idx = buildIndexes(data);
  const logo = logoUrl(settings.logoFile);
  const printed = formatDateTimeShort(new Date().toISOString());
  const hidden = new Set(user.hiddenDepartments);
  const hiddenNames = data.departments.filter((d) => hidden.has(d.id)).map((d) => d.name);

  return (
    <div className="mx-auto max-w-4xl">
      <form className="no-print mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-line" method="get">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Datum</span>
          <input type="date" name="datum" defaultValue={start} className="min-h-11 rounded-lg border border-line px-2" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Umfang</span>
          <select name="tage" defaultValue={String(count)} className="min-h-11 rounded-lg border border-line px-2">
            <option value="1">1 Tag</option>
            <option value="3">3 Tage (je eine Seite)</option>
          </select>
        </label>
        <button type="submit" className="min-h-11 rounded-lg border border-line bg-white px-4 font-semibold hover:bg-slate-50">
          Anzeigen
        </button>
        <div className="ml-auto">
          <PrintButton />
        </div>
      </form>

      {days.map((d) => (
        <PrintDay
          key={d}
          day={filterDayByDepartments(buildDay(data, idx, d), idx, hidden)}
          idx={idx}
          company={settings.companyName}
          logo={logo}
          printed={printed}
          hiddenNames={hiddenNames}
        />
      ))}
    </div>
  );
}

function names(list: PEmployee[]) {
  return list.map((e) => `${e.firstName} ${e.lastName} (${QUALIFICATION_BADGES[e.qualification as Qualification] ?? "?"})`).join(", ");
}

function PrintDay({
  day,
  idx,
  company,
  logo,
  printed,
  hiddenNames,
}: {
  day: DayView;
  idx: Indexes;
  company: string;
  logo: string | null;
  printed: string;
  hiddenNames: string[];
}) {
  const by = (id: string | null) => (id ? (idx.planners.get(id)?.initials ?? "") : "");
  return (
    <section className="print-page mb-8 rounded-xl bg-white p-6 text-[13px] text-black shadow-sm ring-1 ring-line print:mb-0 print:rounded-none print:p-0 print:shadow-none print:ring-0">
      <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div>
          <p className="text-sm">{company}</p>
          <h1 className="text-2xl font-bold">Tageseinteilung {formatDayLong(day.date)} · KW {isoWeek(day.date)}
            {holidayName(day.date) ? ` · ${holidayName(day.date)}` : ""}
          </h1>
          <p className="text-xs">
            {day.stats.assigned} eingeteilt · {day.stats.available} frei · {day.stats.absent} abwesend · gedruckt {printed}
          </p>
          {hiddenNames.length > 0 && <p className="text-xs font-semibold">Ohne Abteilung(en): {hiddenNames.join(", ")}</p>}
        </div>
        {logo && <img src={logo} alt="" className="max-h-14 max-w-40 object-contain" />}
      </header>

      {day.sites.length === 0 ? (
        <p className="mb-4 italic">Keine Baustellen eingeplant.</p>
      ) : (
        <table className="mb-4 w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 pr-2">Baustelle</th>
              <th className="py-1 pr-2 whitespace-nowrap">Zeit</th>
              <th className="py-1 pr-2">Fahrzeug</th>
              <th className="py-1 pr-2">Besatzung</th>
              <th className="py-1 text-right" title="geplant von">✎</th>
            </tr>
          </thead>
          <tbody>
            {day.sites.flatMap((g) =>
              g.items.map((it, i) => (
                <tr key={it.assignment.id} className="break-inside-avoid border-b border-slate-300 align-top">
                  <td className="py-1.5 pr-2">
                    {i === 0 && (
                      <>
                        <span className="mr-1 inline-block size-2.5 rounded-full align-middle print:border print:border-black" style={{ backgroundColor: g.site.color }} />
                        <strong>{g.site.name}</strong>
                        {g.site.orderNumber && <span className="ml-1 font-mono text-xs">Projekt-Nr. {g.site.orderNumber}</span>}
                        {g.site.address && <div className="text-xs">{g.site.address}</div>}
                        {g.warnings.map((w) => (
                          <div key={w.text} className="text-xs font-semibold">
                            ⚠ {w.text}
                          </div>
                        ))}
                      </>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 font-mono whitespace-nowrap">
                    {timeRange(it.assignment.startMin, it.assignment.endMin)}
                    {it.assignment.fixed && <div className="mt-0.5 rounded border-2 border-black px-1 font-sans text-xs font-bold">{fixedLabel(it.assignment)}</div>}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    <strong className="font-mono">{it.vehicle.licensePlate}</strong>
                    <div className="text-xs">{it.vehicle.name}</div>
                    {it.owner && it.owner.state !== "here" && <div className="text-xs">Besitzer: {it.owner.employee.shortName}</div>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {names(it.crew) || "–"}
                    {it.assignment.fixed && it.assignment.fixedNote && <div className="text-xs font-bold">📌 {it.assignment.fixedNote}</div>}
                    {it.assignment.note && <div className="text-xs italic">Hinweis: {it.assignment.note}</div>}
                    {it.crewWarnings.map((w) => (
                      <div key={w.text} className="text-xs font-semibold">
                        ⚠ {w.text}
                      </div>
                    ))}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs">{by(it.assignment.updatedById)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}

      {day.poolVehicles.some((p) => p.crew.length > 0) && (
        <div className="mb-3 break-inside-avoid">
          <h2 className="mb-1 font-bold">Fahrzeuge ohne Baustelle</h2>
          <ul>
            {day.poolVehicles
              .filter((p) => p.crew.length > 0)
              .map((p) => (
                <li key={p.vehicle.id}>
                  <strong className="font-mono">{p.vehicle.licensePlate}</strong> {p.vehicle.name}: {names(p.crew)}
                </li>
              ))}
          </ul>
        </div>
      )}

      {day.rooms.some((r) => r.crew.length > 0) && (
        <div className="mb-3 break-inside-avoid">
          <h2 className="mb-1 font-bold">Räume</h2>
          <ul>
            {day.rooms
              .filter((r) => r.crew.length > 0)
              .map((r) => (
                <li key={r.vehicle.id}>
                  <strong>{r.vehicle.name}</strong>: {names(r.crew)}
                </li>
              ))}
          </ul>
        </div>
      )}

      {day.poolVehicles.some((p) => p.unavailable) && (
        <div className="mb-3 break-inside-avoid">
          <h2 className="mb-1 font-bold">Nicht verfügbare Fahrzeuge</h2>
          <ul>
            {day.poolVehicles
              .filter((p) => p.unavailable)
              .map((p) => (
                <li key={p.vehicle.id}>
                  <strong className="font-mono">{p.vehicle.licensePlate}</strong> {p.vehicle.name} – {p.unavailable!.text}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        <div className="break-inside-avoid">
          <h2 className="mb-1 font-bold">Abwesend ({day.absent.length})</h2>
          {day.absent.length === 0 ? (
            <p className="italic">niemand</p>
          ) : (
            <ul>
              {day.absent.map((a) => (
                <li key={a.employee.id}>
                  <strong className="font-mono">{a.type?.code}</strong> {a.employee.firstName} {a.employee.lastName}
                  <span className="text-xs"> ({a.type?.name}, {formatRange(a.absence.startDate, a.absence.endDate)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="break-inside-avoid">
          <h2 className="mb-1 font-bold">Nicht eingeteilt ({day.poolEmployees.length})</h2>
          <p>{day.poolEmployees.length ? names(day.poolEmployees.map((p) => p.employee)) : <span className="italic">alle eingeteilt</span>}</p>
        </div>
      </div>
    </section>
  );
}
