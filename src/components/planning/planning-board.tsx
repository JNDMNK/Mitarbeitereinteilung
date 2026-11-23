"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { formatDayShort, isIsoDate } from "@/lib/dates";
import { normalizeStart, stepDay, visibleDays } from "@/lib/planning-days";
import type { PlanningData } from "@/lib/planning-types";
import { buildDay, buildIndexes } from "@/lib/planning-view";
import { DayColumn } from "./day-column";
import { PlanningSheets, type Sheet } from "./sheets";
import { Toasts } from "./toasts";
import { usePlanningActions, usePlanningData } from "./use-planning";

type Props = {
  initialStart: string;
  initialData: PlanningData;
  today: string;
  canEdit: boolean;
  ownEmployeeId: string | null;
  hideWeekends: boolean;
};

export function PlanningBoard(props: Props) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <Board {...props} />
    </QueryClientProvider>
  );
}

function Board({ initialStart, initialData, today, canEdit, ownEmployeeId, hideWeekends: initialHide }: Props) {
  const [hideWeekends, setHideWeekends] = useState(initialHide);
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

  function go(next: string) {
    setStart(normalizeStart(next, hideWeekends));
    setMobileDay(0);
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

      {!data || !idx ? (
        <div className="rounded-xl bg-white p-8 text-center text-muted ring-1 ring-line">Lade Planung …</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {days.map((d, i) => (
            <div key={d} className={i === mobileDay ? "" : "hidden md:block"}>
              <DayColumn day={dayViews.get(d)!} idx={idx} today={today} canEdit={canEdit} ownEmployeeId={ownEmployeeId} open={setSheet} />
            </div>
          ))}
        </div>
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
