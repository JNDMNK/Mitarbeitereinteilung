"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api-client";
import { formatDayShort, isIsoDate, weekLabel } from "@/lib/dates";
import { normalizeStart, stepDay, visibleDays } from "@/lib/planning-days";
import type { PlanningData } from "@/lib/planning-types";
import { buildDay, buildIndexes, filterDayByDepartments } from "@/lib/planning-view";
import { EmployeeChip, VehicleLabel } from "./chips";
import { DayColumn } from "./day-column";
import { PlanningDnd, type DragData, type DropData } from "./dnd";
import { PlanningSheets, type Sheet } from "./sheets";
import { TimelineDay } from "./timeline-day";
import { PoolSidebar } from "./pool-sidebar";

const WIDE_QUERY = "(min-width: 1280px)";
/** Breiter Bildschirm (≥ 1280 px, z. B. MacBook Pro 14"): freie Mitarbeiter in eigener Seitenleiste */
function useWideScreen() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}
import { timeRange } from "@/lib/planning-logic";
import { Toasts } from "./toasts";
import { usePlanningActions, usePlanningData } from "./use-planning";
import { useQueryClient } from "@tanstack/react-query";
import { useDebounced, useLiveEvents, useLiveStatus } from "@/components/live/live-events";
import { LiveIndicator } from "@/components/live/live-indicator";
import { useSwipe } from "./use-swipe";

type Props = {
  initialStart: string;
  initialData: PlanningData;
  today: string;
  canEdit: boolean;
  ownEmployeeId: string | null;
  hideWeekends: boolean;
  planningView: "cards" | "timeline";
  hiddenDepartments: string[];
};

export function PlanningBoard(props: Props) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <Board {...props} />
    </QueryClientProvider>
  );
}

function Board({ initialStart, initialData, today, canEdit, ownEmployeeId, hideWeekends: initialHide, planningView, hiddenDepartments: initialHidden }: Props) {
  const [hiddenDeps, setHiddenDeps] = useState<string[]>(initialHidden);
  const [hideWeekends, setHideWeekends] = useState(initialHide);
  const [view, setView] = useState(planningView);
  const [start, setStart] = useState(initialStart);
  const [mobileDay, setMobileDay] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const wide = useWideScreen();
  const dragging = useRef(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Karten: 3 Tage nebeneinander, Zeitleiste: ein Tag in voller Breite
  const dayCount = view === "timeline" ? 1 : 3;
  const days = useMemo(() => visibleDays(start, hideWeekends, dayCount), [start, hideWeekends, dayCount]);
  const shownMobileDay = Math.min(mobileDay, days.length - 1);
  const from = days[0];
  const to = days[days.length - 1];
  const liveStatus = useLiveStatus();
  const query = usePlanningData(from, to, initialData, liveStatus === "live");
  const qc = useQueryClient();
  const reload = useDebounced(() => qc.invalidateQueries({ queryKey: ["planning"] }), 250);
  // Änderungen anderer (und eigene aus anderen Tabs) sofort übernehmen
  useLiveEvents(() => reload());
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
    const hidden = new Set(hiddenDeps);
    if (data && idx) for (const d of days) m.set(d, filterDayByDepartments(buildDay(data, idx, d), idx, hidden));
    return m;
  }, [data, idx, days, hiddenDeps]);

  async function changeHidden(next: string[]) {
    setHiddenDeps(next);
    try {
      await api("/api/auth/prefs", { method: "PATCH", body: { hiddenDepartments: next } });
    } catch {
      /* Einstellung bleibt lokal */
    }
  }
  const hiddenNames = (data?.departments ?? []).filter((d) => hiddenDeps.includes(d.id)).map((d) => d.name);
  const firstDay = dayViews.get(days[0]);

  /** Slot eines Fahrzeugs an einem (sichtbaren) Tag */
  function slotOn(date: string, vehicleId: string) {
    const d = dayViews.get(date);
    if (!d) return undefined;
    return d.poolVehicles.find((p) => p.vehicle.id === vehicleId) ?? d.sites.flatMap((g) => g.items).find((i) => i.vehicle.id === vehicleId);
  }
  function blockedText(date: string, vehicleId: string): string | null {
    const slot = slotOn(date, vehicleId);
    if (!slot?.unavailable) return null;
    const e = slot.unavailable.employee;
    return `${slot.vehicle.licensePlate} ist am ${formatDayShort(date)} nicht verfügbar – mit ${e.firstName} ${e.lastName} abwesend (${slot.unavailable.type?.name ?? "Abwesenheit"}).`;
  }

  /** Ablegen auswerten: was wurde wohin gezogen, verschieben oder kopieren? */
  function handleDrop(drag: DragData, drop: DropData, copy: boolean) {
    if (!data || !idx) return;
    const sameDay = drag.date === drop.date;
    const targetVehicle = drop.kind === "vehicle" ? drop.vehicleId : drag.type === "vehicle" && !(drop.kind === "pool" && sameDay) ? drag.vehicleId : null;
    const blocked = targetVehicle ? blockedText(drop.date, targetVehicle) : null;
    if (blocked) {
      actions.notify("error", [blocked]);
      return;
    }
    if (drag.type === "employee") {
      const e = idx.employees.get(drag.employeeId)!;
      const name = `${e.firstName} ${e.lastName}`;
      if (drop.kind === "vehicle") {
        const v = idx.vehicles.get(drop.vehicleId)!;
        const absent = dayViews.get(drop.date)?.absent.find((a) => a.employee.id === e.id);
        if (absent && !(sameDay && drag.fromVehicleId === drop.vehicleId)) {
          actions.notify("error", [`${name} ist am ${formatDayShort(drop.date)} abwesend (${absent.type?.name ?? "Abwesenheit"}) und kann nicht eingeteilt werden.`]);
          return;
        }
        if (sameDay) {
          if (drag.fromVehicleId === drop.vehicleId) return;
          if (copy) actions.notify("warning", ["Ein Mitarbeiter kann pro Tag nur auf einem Fahrzeug sein – wird verschoben."]);
          void actions.run("crew-assign", { date: drag.date, employeeId: e.id, vehicleId: v.id, expectedFromVehicleId: drag.fromVehicleId }, `${name} → ${v.kind === "ROOM" ? v.name : v.licensePlate}.`);
          return;
        }
        const toExpected = dayViews.get(drop.date)?.seatOf.get(e.id) ?? null;
        if (toExpected === v.id && (copy || !drag.fromVehicleId)) return;
        void actions.run(
          "crew-transfer",
          { fromDate: drag.date, toDate: drop.date, employeeId: e.id, fromVehicleId: drag.fromVehicleId, toVehicleId: v.id, toExpectedVehicleId: toExpected, copy },
          `${name} ${copy ? "kopiert" : "verschoben"} → ${v.kind === "ROOM" ? v.name : v.licensePlate} (${formatDayShort(drop.date)})`,
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

  /** Handy: zum nächsten/vorherigen Tag wischen; am Rand wird weitergeblättert */
  function swipeTo(dir: 1 | -1) {
    if (dir === 1) {
      if (mobileDay < days.length - 1) setMobileDay(mobileDay + 1);
      else setStart(stepDay(start, 1, hideWeekends));
    } else if (mobileDay > 0) {
      setMobileDay(mobileDay - 1);
    } else {
      setStart(stepDay(start, -1, hideWeekends));
    }
    // Tages-Reiter wieder ins Bild holen
    const top = tabsRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) tabsRef.current?.scrollIntoView({ block: "start" });
  }
  const swipe = useSwipe({
    onLeft: () => swipeTo(1),
    onRight: () => swipeTo(-1),
    disabled: () => dragging.current || sheet !== null || window.innerWidth >= 768,
  });

  function go(next: string) {
    setStart(normalizeStart(next, hideWeekends));
    setMobileDay(0);
  }

  async function changeView(next: "cards" | "timeline") {
    setView(next);
    setMobileDay(0);
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
      {/* Steuerleiste: am Handy eine Zeile, Optionen hinter ⚙ */}
      <div className="no-print rounded-xl bg-white p-2 shadow-sm ring-1 ring-line md:p-3">
        <div className="flex flex-wrap items-center gap-2">
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
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line px-2 md:flex-none"
          />
          <span className="text-sm font-semibold whitespace-nowrap text-muted" title="Kalenderwoche">
            {weekLabel(days[0] ?? from, days[days.length - 1] ?? from)}
          </span>
          <button
            type="button"
            aria-expanded={showOptions}
            aria-controls="planning-options"
            onClick={() => setShowOptions((v) => !v)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line text-xl md:hidden"
            title="Ansicht, Wochenende und Feiertage"
          >
            ⚙
          </button>
          <div id="planning-options" className={`${showOptions ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 md:flex md:w-auto`}>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1">
              <input type="checkbox" className="size-5 accent-brand-600" checked={!hideWeekends} onChange={(e) => toggleWeekends(!e.target.checked)} />
              Wochenende &amp; Feiertage
            </label>
            <details className="relative">
              <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 font-semibold ${hiddenDeps.length ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line hover:bg-slate-50"}`}>
                Abteilungen{hiddenDeps.length > 0 && <span className="rounded-full bg-brand-700 px-2 text-xs leading-5 text-white">{hiddenDeps.length} aus</span>} ▾
              </summary>
              <div className="absolute right-0 z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-2 shadow-xl ring-1 ring-line md:right-auto md:left-0">
                <p className="px-2 pb-1 text-xs text-muted">Abgewählte Abteilungen werden komplett ausgeblendet (Mitarbeiter und Fahrzeuge).</p>
                {(data?.departments ?? []).map((d) => (
                  <label key={d.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="size-5 accent-brand-600"
                      checked={!hiddenDeps.includes(d.id)}
                      onChange={(e) => changeHidden(e.target.checked ? hiddenDeps.filter((x) => x !== d.id) : [...hiddenDeps, d.id])}
                    />
                    <span className="size-3 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
                    {d.name}
                  </label>
                ))}
                {hiddenDeps.length > 0 && (
                  <button type="button" onClick={() => changeHidden([])} className="mt-1 min-h-10 w-full rounded-lg border border-line text-sm font-semibold hover:bg-slate-50">
                    Alle einblenden
                  </button>
                )}
              </div>
            </details>
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
          </div>
          <a
            href={`/druck?datum=${from}&tage=${dayCount}`}
            target="_blank"
            rel="noopener"
            className="hidden min-h-11 items-center rounded-lg border border-line px-3 font-semibold hover:bg-slate-50 md:flex"
          >
            🖨 Drucken
          </a>
          <span className="ml-auto hidden items-center gap-3 text-sm text-muted md:flex" aria-live="polite">
            {query.isFetching ? "Aktualisiere …" : query.isError ? "Verbindung gestört – Daten evtl. veraltet" : ""}
            <LiveIndicator status={liveStatus} />
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between md:hidden">
          {query.isError ? <p className="text-sm font-semibold text-red-700">Verbindung gestört – Daten evtl. veraltet</p> : <span />}
          <LiveIndicator status={liveStatus} />
        </div>
      </div>

      {hiddenDeps.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-semibold text-brand-800">Ausgeblendet: {hiddenNames.join(", ")}</span>
          {firstDay?.hidden && (
            <span className="text-muted">
              ({firstDay.hidden.employees} Mitarbeiter, {firstDay.hidden.vehicles} Fahrzeuge am {formatDayShort(days[0])})
            </span>
          )}
          <button type="button" onClick={() => changeHidden([])} className="ml-auto min-h-9 rounded-lg border border-line bg-white px-3 font-semibold hover:bg-slate-50">
            Alle einblenden
          </button>
        </div>
      )}

      {/* Tages-Reiter (Handy) */}
      <div
        ref={tabsRef}
        className={`no-print sticky top-14 z-20 -mx-3 scroll-mt-14 grid-cols-3 gap-1 bg-canvas/95 px-3 py-1 backdrop-blur md:hidden ${dayCount > 1 ? "grid" : "hidden"}`}
        role="tablist"
        aria-label="Tag wählen (oder wischen)"
      >
        {days.map((d, i) => {
          const v = dayViews.get(d);
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={shownMobileDay === i}
              onClick={() => setMobileDay(i)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-lg leading-tight ${mobileDay === i ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line"} ${d === today && mobileDay !== i ? "text-brand-700" : ""}`}
            >
              <span className="text-sm font-bold">
                {d === today ? "Heute" : formatDayShort(d)}
              </span>
              {v && <span className="text-[11px] opacity-80">{v.stats.assigned} eingeteilt</span>}
            </button>
          );
        })}
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
        <PlanningDnd enabled={canEdit} onDrop={handleDrop} renderOverlay={renderOverlay} onDraggingChange={(d) => (dragging.current = d)}>
          <div className="flex items-start gap-4">
          {wide && (
            <PoolSidebar days={days.map((d) => dayViews.get(d)!)} idx={idx} today={today} canEdit={canEdit} ownEmployeeId={ownEmployeeId} open={setSheet} />
          )}
          <div className="min-w-0 flex-1" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
          {view === "cards" ? (
            <div className="grid gap-4 md:grid-cols-3">
              {days.map((d, i) => (
                <div key={d} className={i === shownMobileDay ? "" : "hidden md:block"}>
                  <DayColumn day={dayViews.get(d)!} idx={idx} today={today} canEdit={canEdit} ownEmployeeId={ownEmployeeId} open={setSheet} poolInSidebar={wide} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {days.map((d, i) => (
                <div key={d} className={i === shownMobileDay ? "" : "hidden md:block"}>
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
                    poolInSidebar={wide}
                  />
                </div>
              ))}
            </div>
          )}
          </div>
          </div>
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
