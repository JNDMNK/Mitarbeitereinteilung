"use client";

import { formatDayShort } from "@/lib/dates";
import { groupByQualification } from "@/lib/constants";
import type { DayView, Indexes } from "@/lib/planning-view";
import { DraggableEmployee, Drop } from "./day-column";
import type { Sheet } from "./sheets";

/** Breite Bildschirme: freie Mitarbeiter aller sichtbaren Tage in einer mitlaufenden Leiste */
export function PoolSidebar({
  days,
  idx,
  today,
  canEdit,
  ownEmployeeId,
  open,
}: {
  days: DayView[];
  idx: Indexes;
  today: string;
  canEdit: boolean;
  ownEmployeeId: string | null;
  open: (s: Sheet) => void;
}) {
  return (
    <aside className="sticky top-[calc(4rem_+_env(safe-area-inset-top))] max-h-[calc(100dvh_-_5rem_-_env(safe-area-inset-top))] w-56 shrink-0 2xl:w-64 space-y-3 overflow-y-auto pr-1" aria-label="Nicht eingeteilte Mitarbeiter">
      <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Nicht eingeteilt</h2>
      {days.map((day) => (
        <Drop
          key={day.date}
          id={`sidepool:${day.date}`}
          data={{ kind: "pool", accepts: "both", date: day.date }}
          canEdit={canEdit}
          className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-line"
        >
          <h3 className={`mb-1.5 flex items-baseline justify-between text-sm font-bold ${day.date === today ? "text-brand-700" : ""}`}>
            <span>
              {day.date === today ? "Heute, " : ""}
              {formatDayShort(day.date)}
            </span>
            <span className="text-xs font-semibold text-muted">{day.poolEmployees.length} frei</span>
          </h3>
          {day.poolEmployees.length === 0 ? (
            <p className="text-sm text-muted">Alle eingeteilt.</p>
          ) : (
            <div className="space-y-1.5">
              {groupByQualification(day.poolEmployees, (p) => p.employee.qualification).map((g) => (
                <div key={g.q}>
                  <div className="mb-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
                    {g.label} ({g.items.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {g.items.map((p) => (
                      <DraggableEmployee
                        key={p.employee.id}
                        employee={p.employee}
                        date={day.date}
                        fromVehicleId={null}
                        day={day}
                        idx={idx}
                        canEdit={canEdit}
                        own={p.employee.id === ownEmployeeId}
                        open={open}
                        suffix="side"
                        fullWidth
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Drop>
      ))}
      {canEdit && <p className="text-xs text-muted">Auf ein Fahrzeug im passenden Tag ziehen. Zurück hierher ziehen nimmt jemanden vom Fahrzeug.</p>}
    </aside>
  );
}
