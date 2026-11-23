"use client";

import { formatDayLong, formatDayShort, isWeekend, mapsUrl } from "@/lib/dates";
import { timeRange } from "@/lib/planning-logic";
import type { DayView, Indexes } from "@/lib/planning-view";
import { EmployeeChip, VehicleLabel, WarningList } from "./chips";
import type { Sheet } from "./sheets";

type Props = {
  day: DayView;
  idx: Indexes;
  today: string;
  canEdit: boolean;
  ownEmployeeId: string | null;
  open: (s: Sheet) => void;
};

export function DayColumn({ day, idx, today, canEdit, ownEmployeeId, open }: Props) {
  const isToday = day.date === today;
  const empClick = (employeeId: string) => () => open({ kind: "employee", date: day.date, employeeId });
  const chip = (employeeId: string) => {
    const e = idx.employees.get(employeeId)!;
    const abs = day.absent.find((a) => a.employee.id === e.id);
    return (
      <EmployeeChip
        key={e.id}
        employee={e}
        department={idx.departments.get(e.departmentId)}
        absenceType={abs?.type}
        own={e.id === ownEmployeeId}
        onClick={empClick(e.id)}
      />
    );
  };

  return (
    <section className="min-w-0 space-y-3" aria-label={formatDayLong(day.date)}>
      {/* Kopf */}
      <header
        className={`sticky top-14 z-20 flex items-center justify-between gap-2 rounded-xl px-3 py-2 shadow-sm ${
          isToday ? "bg-brand-700 text-white" : isWeekend(day.date) ? "bg-slate-300 text-ink" : "bg-ink text-white"
        }`}
      >
        <div>
          <h2 className="text-lg leading-tight font-bold">{formatDayShort(day.date)}</h2>
          <p className="text-xs opacity-90">
            {isToday ? "Heute · " : ""}
            {day.stats.assigned} eingeteilt · {day.stats.available} frei · {day.stats.absent} abwesend
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => open({ kind: "pickSiteForDay", date: day.date })}
            className="min-h-10 rounded-lg bg-white/15 px-3 text-sm font-semibold hover:bg-white/25"
          >
            + Baustelle
          </button>
        )}
      </header>

      {/* Abwesend */}
      {day.absent.length > 0 && (
        <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-line">
          <h3 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Abwesend ({day.absent.length})</h3>
          <div className="flex flex-wrap gap-1">
            {day.absent.map((a) => (
              <button
                key={a.employee.id}
                type="button"
                onClick={empClick(a.employee.id)}
                title={`${a.employee.firstName} ${a.employee.lastName}: ${a.type?.name}`}
                className={`inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold ring-1 ring-line ${a.employee.id === ownEmployeeId ? "bg-brand-50 ring-2 ring-brand-600" : "bg-slate-50"}`}
              >
                <span className="rounded px-1 font-mono leading-5 font-bold text-white" style={{ backgroundColor: a.type?.color }}>
                  {a.type?.code}
                </span>
                {a.employee.shortName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Baustellen */}
      {day.sites.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-line bg-white/60 p-4 text-center text-sm text-muted">Noch keine Baustellen eingeplant.</div>
      )}
      {day.sites.map((g) => (
        <article key={g.site.id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line" style={{ borderLeft: `6px solid ${g.site.color}` }}>
          <div className="flex items-start gap-2 border-b border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <h3 className="leading-tight font-bold">{g.site.name}</h3>
              {g.site.address && (
                <a href={mapsUrl(g.site.address)} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand-700 underline">
                  📍 {g.site.address}
                </a>
              )}
              <WarningList warnings={g.warnings} />
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => open({ kind: "pickVehicleForSite", date: day.date, siteId: g.site.id })}
                className="min-h-9 shrink-0 rounded-lg border border-line px-2 text-sm font-semibold hover:bg-slate-50"
                title="Weiteres Fahrzeug einplanen"
              >
                + 🚐
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {g.items.map((it) => (
              <li key={it.assignment.id} className="space-y-1.5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-slate-800 px-1.5 font-mono text-xs leading-6 font-bold text-white">
                    {timeRange(it.assignment.startMin, it.assignment.endMin)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <VehicleLabel
                      vehicle={it.vehicle}
                      crewCount={it.crew.length}
                      onClick={() => open({ kind: "vehicle", date: day.date, vehicleId: it.vehicle.id, assignmentId: it.assignment.id })}
                    />
                  </div>
                </div>
                {it.crew.length > 0 ? (
                  <div className="flex flex-wrap gap-1">{it.crew.map((e) => chip(e.id))}</div>
                ) : null}
                {it.assignment.note && <p className="text-xs text-muted italic">{it.assignment.note}</p>}
                <WarningList warnings={it.crewWarnings} />
              </li>
            ))}
          </ul>
        </article>
      ))}

      {/* Pool */}
      <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-line">
        <h3 className="mb-2 text-sm font-bold">Nicht eingeteilt</h3>
        <div className="mb-3">
          <h4 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Mitarbeiter ({day.poolEmployees.filter((p) => !p.absence).length} verfügbar)</h4>
          {day.poolEmployees.length === 0 ? (
            <p className="text-sm text-muted">Alle eingeteilt.</p>
          ) : (
            <div className="flex flex-wrap gap-1">{day.poolEmployees.map((p) => chip(p.employee.id))}</div>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Fahrzeuge ohne Baustelle ({day.poolVehicles.length})</h4>
          <div className="space-y-1.5">
            {day.poolVehicles.map((p) => (
              <div key={p.vehicle.id} className={`rounded-lg bg-white px-2 py-1 ring-1 ring-line ${p.crew.length ? "" : "opacity-90"}`}>
                <VehicleLabel vehicle={p.vehicle} crewCount={p.crew.length} onClick={() => open({ kind: "vehicle", date: day.date, vehicleId: p.vehicle.id })} />
                {p.crew.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{p.crew.map((e) => chip(e.id))}</div>}
                <WarningList warnings={p.crewWarnings} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
