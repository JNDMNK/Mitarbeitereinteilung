"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { formatDayShort, isIsoDate } from "@/lib/dates";
import { normalizeStart, stepDay, visibleDays } from "@/lib/planning-days";
import type { PlanningData } from "@/lib/planning-types";
import { buildDay, buildIndexes } from "@/lib/planning-view";
import { EmployeeChip, VehicleLabel } from "./chips";
import { DayColumn } from "./day-column";
import { PlanningDnd, type DragData, type DropData } from "./dnd";
import { PlanningSheets, type Sheet } from "./sheets";
import { TimelineDay } from "./timeline-day";
import { timeRange } from "@/lib/planning-logic";
import { Toasts } from "./toasts";
import { usePlanningActions, usePlanningData } from "./use-planning";

type Props = {
  initialStart: string;
  initialData: PlanningData;
  today: string;
  canEdit: boolean;
  ownEmployeeId: string | null;
  hideWeekends: boolean;
  planningView: "cards" | "timeline";
};

export function PlanningBoard(props: Props) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <Board {...props} />
    </QueryClientProvider>
  );
}

function Board({ initialStart, initialData, today, canEdit, ownEmployeeId, hideWeekends: initialHide, planningView }: Props) {
  const [hideWeekends, setHideWeekends] = useState(initialHide);
  const [view, setView] = useState(planningView);
  const [start, setStart] = useState(initialStart);
  const [mobileDay, setMobileDay] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const days = useMemo(() => visibleDays(start, hideWeekends), [start, hideWeekends]);
  const from = days[0];
  const to = days[days.length - 1];
  const query = usePlanningData(from, to, initialData);
  const actions = usePlanningActions();

  // URL mitführen (Neu laden / Link teilen behält das Datum)
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("datum", from);
    window.history.replaceState(window.history.state, "", url);
  }, [from]);

  const data = query.data;
  const idx = useMemo(() => (data ? buildIndexes(data) : null), [data]);
  const dayViews = useMemo(() => {
    const m = new Map<string, ReturnType<typeof buildDay>>();
    if (data && idx) for (const d of days) m.set(d, buildDay(data, idx, d));
    return m;
  }, [data, idx, days]);

  /** Ablegen auswerten: was wurde wohin gezogen, verschieben oder kopieren? */
  function handleDrop(drag: DragData, drop: DropData, copy: boolean) {
    if (!data || !idx) return;
    const sameDay = drag.date === drop.date;
    if (drag.type === "employee") {
      const e = idx.employees.get(drag.employeeId)!;
      const name = `${e.firstName} ${e.lastName}`;
      if (drop.kind === "vehicle") {
        const v = idx.vehicles.get(drop.vehicleId)!;
        if (sameDay) {
          if (drag.fromVehicleId === drop.vehicleId) return;
          if (copy) actions.notify("warning", ["Ein Mitarbeiter kann pro Tag nur auf einem Fahrzeug sein – wird verschoben."]);
          void actions.run("crew-assign", { date: drag.date, employeeId: e.id, vehicleId: v.id, expectedFromVehicleId: drag.fromVehicleId }, `${name} → ${v.licensePlate}.`);
          return;
        }
        const toExpected = dayViews.get(drop.date)?.seatOf.get(e.id) ?? null;
        if (toExpected === v.id && (copy || !drag.fromVehicleId)) return;
        void actions.run(
          "crew-transfer",
          { fromDate: drag.date, toDate: drop.date, employeeId: e.id, fromVehicleId: drag.fromVehicleId, toVehicleId: v.id, toExpectedVehicleId: toExpected, copy },
          `${name} ${copy ? "kopiert" : "verschoben"} → ${v.licensePlate} (${formatDayShort(drop.date)})`,
        );
        return;
      }
      // in den Pool
      if (sameDay && drag.fromVehicleId) {
        void actions.run("crew-remove", { date: drag.date, employeeId: e.id, expectedFromVehicleId: drag.fromVehicleId }, `${name} zurück in den Pool.`);
      } else if (!sameDay) {
        actions.notify("warning", ["Zum Entfernen bitte in den Pool desselben Tages ziehen."]);
      }
      return;
    }

    // Fahrzeug
    const v = idx.vehicles.get(drag.vehicleId)!;
    if (drop.kind === "site") {
      if (sameDay && !copy && drag.siteId === drop.siteId) return;
      setSheet({ kind: "dropTime", drag, toDate: drop.date, toSiteId: drop.siteId, copy });
      return;
    }
    if (drop.kind === "pool") {
      if (sameDay) {
        if (drag.assignmentId && !copy && drag.assignmentVersion !== null) {
          const site = drag.siteId ? idx.sites.get(drag.siteId) : undefined;
          void actions.run("assignment-delete", { id: drag.assignmentId, version: drag.assignmentVersion }, `${v.licensePlate} von „${site?.name ?? "Baustelle"}“ zurück in den Pool.`);
        }
        return;
      }
      void actions.run(
        "vehicle-transfer",
        { fromDate: drag.date, toDate: drop.date, vehicleId: v.id, assignmentId: drag.assignmentId, fromVersion: drag.vdVersion, toSiteId: null, copy },
        `${v.licensePlate} ${copy ? "kopiert" : "verschoben"} nach ${formatDayShort(drop.date)} (ohne Baustelle).`,
      );
    }
  }

  function renderOverlay(drag: DragData, copy: boolean) {
    if (!idx) return null;
    const badge = copy ? <span className="absolute -top-3 -right-3 rounded-full bg-amber-400 px-2 text-xs leading-6 font-bold text-ink shadow">+ Kopie</span> : null;
    if (drag.type === "employee") {
      const e = idx.employees.get(drag.employeeId);
      return e ? (
        <div className="relative inline-block rotate-2 shadow-2xl">
          <EmployeeChip employee={e} department={idx.departments.get(e.departmentId)} />
          {badge}
        </div>
      ) : null;
    }
    const v = idx.vehicles.get(drag.vehicleId);
    const crew = data?.vehicleDays.find((x) => x.date === drag.date && x.vehicleId === drag.vehicleId)?.crew ?? [];
    return v ? (
      <div className="relative w-72 rotate-1 rounded-lg bg-white p-2 shadow-2xl ring-2 ring-brand-600">
        <VehicleLabel vehicle={v} crewCount={crew.length} />
        <p className="mt-1 truncate text-xs text-muted">{crew.map((c) => idx.employees.get(c.employeeId)?.shortName).join(", ") || "ohne Besatzung"}</p>
        {badge}
      </div>
    ) : null;
  }

  function go(next: string) {
    setStart(normalizeStart(next, hideWeekends));
    setMobileDay(0);
  }

  async function changeView(next: "cards" | "timeline") {
    setView(next);
    try {
      await api("/api/auth/prefs", { method: "PATCH", body: { planningView: next } });
    } catch {
      /* Einstellung bleibt lokal */
    }
  }

  async function toggleWeekends(hide: boolean) {
    setHideWeekends(hide);
    setStart((s) => normalizeStart(s, hide));
    try {
      await api("/api/auth/prefs", { method: "PATCH", body: { hideWeekends: hide } });
    } catch {
      /* Einstellung bleibt lokal */
    }
  }

  return (
    <div className="space-y-3">
      {/* Steuerleiste */}
      <div className="no-print flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-line md:p-3">
        <div className="flex items-center gap-1">
          <NavButton label="Einen Tag zurück" onClick={() => go(stepDay(from, -1, hideWeekends))}>
            ◀
          </NavButton>
          <button type="button" onClick={() => go(today)} className="min-h-11 rounded-lg border border-line px-3 font-semibold hover:bg-slate-50">
            Heute
          </button>
          <NavButton label="Einen Tag vor" onClick={() => go(stepDay(from, 1, hideWeekends))}>
            ▶
          </NavButton>
        </div>
        <input
          type="date"
          aria-label="Datum wählen"
          value={from}
          onChange={(e) => isIsoDate(e.target.value) && go(e.target.value)}
          className="min-h-11 rounded-lg border border-line px-2"
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1">
          <input type="checkbox" className="size-5 accent-brand-600" checked={!hideWeekends} onChange={(e) => toggleWeekends(!e.target.checked)} />
          Wochenende
        </label>
        <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Ansicht">
          {(
            [
              ["cards", "Karten"],
              ["timeline", "Zeitleiste"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => changeView(key)}
              className={`min-h-11 px-3 font-semibold ${view === key ? "bg-brand-700 text-white" : "bg-white hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted" aria-live="polite">
          {query.isFetching ? "Aktualisiere …" : query.isError ? "Verbindung gestört – Daten evtl. veraltet" : ""}
        </span>
      </div>

      {/* Tages-Reiter (Handy) */}
      <div className="no-print grid grid-cols-3 gap-1 md:hidden" role="tablist" aria-label="Tag wählen">
        {days.map((d, i) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={mobileDay === i}
            onClick={() => setMobileDay(i)}
            className={`min-h-12 rounded-lg text-sm font-bold ${mobileDay === i ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line"} ${d === today && mobileDay !== i ? "text-brand-700" : ""}`}
          >
            {formatDayShort(d)}
          </button>
        ))}
      </div>

      {canEdit && view === "timeline" && (
        <p className="no-print hidden text-sm text-muted md:block">
          Balken ziehen verschiebt den Einsatz, die Ränder ändern die Länge (15-Minuten-Raster). Klick auf einen Balken oder ein Fahrzeug öffnet die Aktionen, Klick in einen freien Bereich plant eine Baustelle ein.
        </p>
      )}
      {canEdit && view === "cards" && (
        <p className="no-print hidden text-sm text-muted md:block">
          Ziehen zum Verschieben – auch in eine andere Tagesspalte. Mit gedrückter <kbd className="rounded border border-line bg-white px-1">Strg</kbd> oder{" "}
          <kbd className="rounded border border-line bg-white px-1">Alt</kbd> wird kopiert. Antippen öffnet die Aktionen.
        </p>
      )}

      {!data || !idx ? (
        <div className="rounded-xl bg-white p-8 text-center text-muted ring-1 ring-line">Lade Planung …</div>
      ) : (
        <PlanningDnd enabled={canEdit} onDrop={handleDrop} renderOverlay={renderOverlay}>
          {view === "cards" ? (
            <div className="grid gap-4 md:grid-cols-3">
              {days.map((d, i) => (
                <div key={d} className={i === mobileDay ? "" : "hidden md:block"}>
                  <DayColumn day={dayViews.get(d)!} idx={idx} today={today} canEdit={canEdit} ownEmployeeId={ownEmployeeId} open={setSheet} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {days.map((d, i) => (
                <div key={d} className={i === mobileDay ? "" : "hidden md:block"}>
                  <TimelineDay
                    day={dayViews.get(d)!}
                    data={data}
                    idx={idx}
                    today={today}
                    canEdit={canEdit}
                    ownEmployeeId={ownEmployeeId}
                    open={setSheet}
                    updateTime={(a, next) =>
                      actions.run(
                        "assignment-update",
                        { id: a.id, version: a.version, startMin: next.startMin, endMin: next.endMin },
                        `Zeit auf ${timeRange(next.startMin, next.endMin)} geändert.`,
                      )
                    }
                    notifyError={(text) => actions.notify("error", [text])}
                  />
                </div>
              ))}
            </div>
          )}
        </PlanningDnd>
      )}

      {data && idx && (
        <PlanningSheets sheet={sheet} setSheet={setSheet} data={data} idx={idx} days={dayViews} canEdit={canEdit} run={actions.run} busy={actions.busy} />
      )}
      <Toasts toasts={actions.toasts} onDismiss={actions.dismiss} />
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line text-xl font-bold hover:bg-slate-50">
      {children}
    </button>
  );
}
