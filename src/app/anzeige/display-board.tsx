"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { LiveRefresh } from "@/components/live/live-refresh";
import { DisplayHeader } from "./display-header";
import type { DDay, DPerson, DVehicle } from "@/lib/display-view";

const MIN_FONT = 6;
// hoch genug für 4K-Fernseher ohne Skalierung
const MAX_FONT = 64;

/**
 * Schriftgröße (rem-Basis) so wählen, dass alle Tagesspalten ohne Scrollen passen.
 * Da alle Abstände in rem sind, skaliert damit das komplette Layout.
 */
function useFitToScreen(deps: unknown[]) {
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fit = useCallback(() => {
    const html = document.documentElement;
    const cols = colRefs.current.filter((c): c is HTMLDivElement => !!c);
    if (cols.length === 0) return;
    // Höhe des Inhalts gegen den verfügbaren Platz (inkl. kleinem Sicherheitsabstand)
    const fits = () =>
      cols.every((c) => {
        const inner = c.firstElementChild as HTMLElement | null;
        if (!inner) return true;
        const cs = getComputedStyle(c);
        const avail = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        return inner.getBoundingClientRect().height <= avail - 2;
      });
    let lo = MIN_FONT;
    let hi = MAX_FONT;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      html.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid;
    }
    html.style.fontSize = `${Math.floor(lo * 10) / 10}px`;
  }, []);

  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- neu einpassen, wenn sich die Daten ändern
  }, deps);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    document.fonts?.ready.then(schedule).catch(() => {});
    // Logo/Schrift laden nach -> Kopfzeile ändert die Höhe -> neu einpassen
    const t = setTimeout(schedule, 1500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("load", schedule);
      document.documentElement.style.fontSize = "";
    };
  }, [fit]);

  return colRefs;
}

export function DisplayBoard({
  days,
  count,
  today,
  companyName,
  logoUrl,
  canLeave,
  nav,
}: {
  nav: { prev: string; next: string; isToday: boolean; start: string };
  days: DDay[];
  count: number;
  today: string;
  companyName: string;
  logoUrl: string | null;
  canLeave: boolean;
}) {
  const colRefs = useFitToScreen([days, count]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-100 text-ink">
      <LiveRefresh scopes={["planning", "absences", "masterdata"]} fallbackMs={60_000} />
      <DisplayHeader companyName={companyName} logoUrl={logoUrl} count={count} mode="plan" today={today} nav={nav} canLeave={canLeave} homeHref={`/anzeige?tage=${count}`} />

      <main className="grid min-h-0 flex-1 gap-[0.6rem] p-[0.6rem]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <section key={d.date} className="flex min-h-0 flex-col overflow-hidden rounded-[0.5rem] bg-white shadow ring-1 ring-line">
            <DayHead day={d} />
            <div
              ref={(el) => {
                colRefs.current[i] = el;
              }}
              className="min-h-0 flex-1 overflow-hidden p-[0.5rem]"
            >
              <DayBody day={d} />
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function DayHead({ day }: { day: DDay }) {
  const off = !!day.holiday;
  return (
    <div className={`shrink-0 px-[0.7rem] py-[0.4rem] ${day.isToday ? "bg-brand-700 text-white" : off ? "bg-slate-300" : "bg-ink text-white"}`}>
      <div className="flex items-baseline gap-[0.5rem]">
        <span className="text-[1.5rem] leading-tight font-bold">{day.isToday ? `Heute, ${day.short}` : day.long}</span>
        <span className="rounded bg-white/20 px-[0.35rem] text-[0.85rem] font-semibold whitespace-nowrap">KW {day.kw}</span>
      </div>
      <div className="text-[0.85rem] opacity-90">
        {day.holiday && <strong>🎉 {day.holiday} · </strong>}
        {day.stats.assigned} eingeteilt · {day.stats.available} frei · {day.stats.absent} abwesend
      </div>
    </div>
  );
}

function Badge({ p }: { p: DPerson }) {
  return p.badge ? <span className="ml-[0.2rem] rounded bg-slate-200 px-[0.2rem] font-mono text-[0.7rem] font-bold text-slate-700">{p.badge}</span> : null;
}

function Person({ p }: { p: DPerson }) {
  return (
    <span className="inline-flex items-center rounded-[0.25rem] border-l-[0.2rem] bg-slate-50 px-[0.3rem] py-[0.05rem] text-[0.95rem] whitespace-nowrap ring-1 ring-line" style={{ borderLeftColor: p.color }}>
      {p.name}
      <Badge p={p} />
    </span>
  );
}

function Section({ title, children, tone = "slate" }: { title: string; children: React.ReactNode; tone?: "slate" | "red" }) {
  return (
    <div className="mt-[0.5rem] first:mt-0">
      <h3 className={`mb-[0.2rem] text-[0.75rem] font-bold tracking-wide uppercase ${tone === "red" ? "text-red-800" : "text-muted"}`}>{title}</h3>
      {children}
    </div>
  );
}

function VehicleLine({ v }: { v: DVehicle }) {
  return (
    <div className="flex flex-wrap items-center gap-[0.25rem] py-[0.15rem]">
      {v.time && <span className="rounded bg-ink px-[0.3rem] font-mono text-[0.8rem] font-bold text-white">{v.time}</span>}
      {v.isRoom ? (
        <span className="text-[0.95rem] font-semibold">🏠 {v.name}</span>
      ) : (
        <span className="rounded border-[0.12rem] border-ink px-[0.25rem] font-mono text-[0.85rem] font-bold whitespace-nowrap">{v.plate}</span>
      )}
      {v.crew.length === 0 ? <span className="text-[0.9rem] text-muted">ohne Besatzung</span> : v.crew.map((p) => <Person key={p.id} p={p} />)}
      {v.note && <span className="w-full text-[0.8rem] text-muted italic">{v.note}</span>}
      {v.warning && <span className="w-full text-[0.8rem] font-semibold text-red-700">⚠ {v.warning}</span>}
    </div>
  );
}

function DayBody({ day }: { day: DDay }) {
  const empty = day.sites.length === 0 && day.idleVehicles.length === 0 && day.rooms.length === 0;
  return (
    <div>
      {day.absent.length > 0 && (
        <Section title={`Abwesend (${day.absent.length})`} tone="red">
          <div className="flex flex-wrap gap-[0.25rem]">
            {day.absent.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-[0.25rem] rounded-[0.25rem] bg-red-50 px-[0.3rem] py-[0.05rem] text-[0.95rem] ring-1 ring-red-200" title={a.typeName}>
                <span className="rounded px-[0.2rem] font-mono text-[0.75rem] font-bold text-white" style={{ backgroundColor: a.typeColor }}>
                  {a.code}
                </span>
                {a.name}
              </span>
            ))}
          </div>
        </Section>
      )}

      {day.sites.map((s) => (
        <div key={s.id} className="mt-[0.5rem] rounded-[0.35rem] border-l-[0.35rem] bg-white px-[0.5rem] py-[0.3rem] ring-1 ring-line" style={{ borderLeftColor: s.color }}>
          <div className="flex flex-wrap items-baseline gap-x-[0.4rem]">
            <span className="text-[1.1rem] leading-tight font-bold">{s.name}</span>
            {s.orderNumber && <span className="font-mono text-[0.75rem] text-muted">Projekt-Nr. {s.orderNumber}</span>}
          </div>
          {s.address && <div className="text-[0.8rem] text-muted">📍 {s.address}</div>}
          {s.vehicles.map((v) => (
            <VehicleLine key={v.id + (v.time ?? "")} v={v} />
          ))}
        </div>
      ))}

      {empty && <p className="mt-[0.5rem] text-[1rem] text-muted">Noch nichts eingeteilt.</p>}

      {day.idleVehicles.length > 0 && (
        <Section title="Fahrzeuge ohne Baustelle">
          {day.idleVehicles.map((v) => (
            <VehicleLine key={v.id} v={v} />
          ))}
        </Section>
      )}

      {day.rooms.length > 0 && (
        <Section title="Räume">
          {day.rooms.map((v) => (
            <VehicleLine key={v.id} v={v} />
          ))}
        </Section>
      )}

      {day.unavailable.length > 0 && (
        <Section title="Nicht verfügbar">
          {day.unavailable.map((u) => (
            <div key={u.plate} className="text-[0.85rem]">
              <span className="font-mono font-bold">{u.plate}</span> {u.text}
            </div>
          ))}
        </Section>
      )}

      {day.free.length > 0 && (
        <Section title={`Nicht eingeteilt (${day.stats.available})`}>
          {day.free.map((g) => (
            <div key={g.label} className="flex flex-wrap items-center gap-[0.25rem] py-[0.1rem]">
              <span className="text-[0.75rem] font-semibold text-muted">{g.label}:</span>
              {g.people.map((p) => (
                <Person key={p.id} p={p} />
              ))}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
