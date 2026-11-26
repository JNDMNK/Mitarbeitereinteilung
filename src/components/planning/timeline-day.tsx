"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { crewWarnings, timeRange, fixedConfirmText, fixedLabel } from "@/lib/planning-logic";
import type { PAssignment, PEmployee, PlanningData, PVehicle, PVehicleDay } from "@/lib/planning-types";
import type { DayView, Indexes } from "@/lib/planning-view";
import { formatMinutes } from "@/lib/time";
import { applyDrag, collides, computeAxis, pxToMinutes, toPercent, type DragMode, type Interval } from "@/lib/timeline";
import { DueBadges } from "./chips";
import { AbsentBar, DayHeader, DraggableEmployee, Drop, RoomsBox } from "./day-column";
import type { Sheet } from "./sheets";
import type { RunResult } from "./use-planning";

type Props = {
  day: DayView;
  data: PlanningData;
  idx: Indexes;
  today: string;
  canEdit: boolean;
  ownEmployeeId: string | null;
  open: (s: Sheet) => void;
  updateTime: (a: PAssignment, next: Interval) => Promise<RunResult>;
  notifyError: (text: string) => void;
  poolInSidebar?: boolean;
};

type Row = { vehicle: PVehicle; vd: PVehicleDay | null; crew: PEmployee[] };

/** Lesbare Schriftfarbe auf farbigem Hintergrund */
function textOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#0f172a" : "#ffffff";
}

function nowMinutes(): number {
  const parts = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Berlin" }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function TimelineDay({ day, data, idx, today, canEdit, ownEmployeeId, open, updateTime, notifyError, poolInSidebar = false }: Props) {
  const rows: Row[] = useMemo(() => {
    const vds = data.vehicleDays.filter((v) => v.date === day.date);
    const byVehicle = new Map(vds.map((v) => [v.vehicleId, v]));
    const visible = new Set([...day.poolVehicles.map((p) => p.vehicle.id), ...day.sites.flatMap((g) => g.items.map((i) => i.vehicle.id))]);
    const list = data.vehicles
      .filter((v) => (v.active || byVehicle.has(v.id)) && visible.has(v.id))
      .map((vehicle) => {
        const vd = byVehicle.get(vehicle.id) ?? null;
        const crew = (vd?.crew ?? []).map((c) => idx.employees.get(c.employeeId)).filter((e): e is PEmployee => !!e);
        return { vehicle, vd, crew };
      });
    // feste Reihenfolge laut Stammdaten – Fahrzeuge springen beim Einteilen nicht umher
    return list.sort((a, b) => a.vehicle.sortOrder - b.vehicle.sortOrder || a.vehicle.name.localeCompare(b.vehicle.name));
  }, [data, idx, day]);

  const axis = useMemo(
    () => computeAxis(rows.flatMap((r) => r.vd?.assignments ?? []), data.settings.defaultStartMin, data.settings.defaultEndMin),
    [rows, data.settings],
  );
  const hours: number[] = [];
  for (let t = axis.startMin; t <= axis.endMin; t += 60) hours.push(t);

  // Jetzt-Linie erst nach dem Laden berechnen (sonst Abweichung Server/Browser)
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (day.date !== today) return;
    const tick = () => setNow(nowMinutes());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [day.date, today]);

  // Auf schmalen Bildschirmen zum Arbeitsbeginn scrollen
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const labelWidth = window.innerWidth >= 768 ? 240 : 112;
    const trackWidth = el.scrollWidth - labelWidth;
    const target = Math.max(axis.startMin, data.settings.defaultStartMin - 60);
    el.scrollLeft = ((target - axis.startMin) / (axis.endMin - axis.startMin)) * trackWidth;
  }, [axis, data.settings.defaultStartMin]);

  const absentIds = new Set(day.absent.map((a) => a.employee.id));

  return (
    <section className="space-y-2" aria-label={`Zeitleiste ${day.date}`}>
      <DayHeader day={day} today={today} canEdit={canEdit} open={open} sticky={false} />
      <AbsentBar day={day} ownEmployeeId={ownEmployeeId} open={open} idx={idx} />

      <div ref={scrollRef} data-no-swipe className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-line">
        <div className="min-w-[860px]">
          {/* Stundenachse */}
          <div className="flex border-b border-line">
            <div className="sticky left-0 z-20 w-28 shrink-0 border-r border-line bg-white px-2 py-1 text-xs font-bold text-muted md:w-60">Fahrzeug</div>
            <div className="relative h-7 flex-1">
              {hours.map((h) => (
                <span key={h} className="absolute top-1 -translate-x-1/2 text-xs font-semibold text-slate-600" style={{ left: `${toPercent(h, axis)}%` }}>
                  {/* Linien nahe am Rand ohne Beschriftung (würde abgeschnitten) */}
                  {h - axis.startMin >= 30 && axis.endMin - h >= 30 ? formatMinutes(h) : ""}
                </span>
              ))}
            </div>
          </div>

          {rows.map((r) => {
            const assignments = r.vd?.assignments ?? [];
            const slot = day.poolVehicles.find((p) => p.vehicle.id === r.vehicle.id) ?? day.sites.flatMap((g) => g.items).find((i) => i.vehicle.id === r.vehicle.id);
            const warnings = slot?.crewWarnings ?? crewWarnings(r.vehicle, r.crew, absentIds, assignments.length > 0);
            const unavailable = slot?.unavailable;
            const owner = slot?.owner;
            return (
              <div key={r.vehicle.id} className="flex border-b border-line last:border-b-0">
                <Drop
                  id={`tl-veh:${day.date}:${r.vehicle.id}`}
                  data={{ kind: "vehicle", accepts: "employee", date: day.date, vehicleId: r.vehicle.id }}
                  canEdit={canEdit}
                  disabled={!!unavailable}
                  className={`sticky left-0 z-20 w-28 shrink-0 border-r border-line md:w-60 ${unavailable ? "bg-slate-100" : "bg-white"}`}
                >
                  <button
                    type="button"
                    onClick={() => open({ kind: "vehicle", date: day.date, vehicleId: r.vehicle.id })}
                    className="flex h-full min-h-14 w-full flex-col justify-center px-2 py-1 text-left hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="rounded border-2 border-ink px-1 font-mono text-xs leading-4 font-bold whitespace-nowrap">{r.vehicle.licensePlate}</span>
                      <span className="hidden truncate text-sm font-semibold md:inline">{r.vehicle.name}</span>
                      <span className={`ml-auto rounded-full px-1.5 text-[11px] leading-4 font-bold ${r.crew.length > r.vehicle.seats ? "bg-red-600 text-white" : "bg-slate-200"}`}>
                        {r.crew.length}/{r.vehicle.seats}
                      </span>
                    </span>
                    <span className={`truncate text-xs ${r.crew.some((e) => e.id === ownEmployeeId) ? "font-bold text-brand-700" : "text-muted"}`}>
                      {r.crew.length ? r.crew.map((e) => `${idx.names.get(e.id) ?? e.shortName}${absentIds.has(e.id) ? "⚠" : ""}`).join(", ") : "–"}
                    </span>
                    {owner && (
                      <span className="truncate text-[11px] text-slate-600" title={`Besitzer: ${owner.employee.firstName} ${owner.employee.lastName}`}>
                        👤 {idx.names.get(owner.employee.id) ?? owner.employee.shortName}
                        {owner.state === "absent" ? ` abwesend (${owner.absence?.type?.code ?? "?"})` : owner.state === "elsewhere" ? ` auf ${owner.elsewhereVehicle?.licensePlate ?? "?"}` : ""}
                      </span>
                    )}
                    {unavailable && (
                      <span className="truncate text-[11px] font-bold text-red-700" title={unavailable.text}>
                        {unavailable.outage ? `🔧 ${unavailable.short}` : "🚫 nicht verfügbar"}
                      </span>
                    )}
                    {slot?.due && (
                      <span className="flex flex-wrap gap-1">
                        <DueBadges due={slot.due} />
                      </span>
                    )}
                    {warnings.length > 0 && (
                      <span className={`truncate text-[11px] font-semibold ${warnings.some((w) => w.level === "error") ? "text-red-700" : "text-amber-800"}`} title={warnings.map((w) => w.text).join("\n")}>
                        ⚠ {warnings[0].text}
                        {warnings.length > 1 ? ` (+${warnings.length - 1})` : ""}
                      </span>
                    )}
                  </button>
                </Drop>
                <Track
                  disabled={!!unavailable}
                  date={day.date}
                  vehicleId={r.vehicle.id}
                  axis={axis}
                  hours={hours}
                  now={now}
                  assignments={assignments}
                  idx={idx}
                  canEdit={canEdit}
                  open={open}
                  updateTime={updateTime}
                  notifyError={notifyError}
                />
              </div>
            );
          })}
        </div>
      </div>

      <RoomsBox day={day} idx={idx} canEdit={canEdit} ownEmployeeId={ownEmployeeId} open={open} />

      {/* Pool-Mitarbeiter: auf eine Fahrzeugzeile ziehen oder antippen */}
      <div className={`rounded-xl bg-slate-50 p-2 ring-1 ring-line ${poolInSidebar ? "hidden" : ""}`}>
        <h3 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">
          Nicht eingeteilt ({day.poolEmployees.length} verfügbar){canEdit ? " – auf ein Fahrzeug ziehen" : ""}
        </h3>
        <div className="flex flex-wrap gap-1">
          {day.poolEmployees.length === 0 && <span className="text-sm text-muted">Alle eingeteilt.</span>}
          {day.poolEmployees.map((p) => (
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
              suffix="tl-pool"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Track({
  disabled,
  date,
  vehicleId,
  axis,
  hours,
  now,
  assignments,
  idx,
  canEdit,
  open,
  updateTime,
  notifyError,
}: {
  disabled?: boolean;
  date: string;
  vehicleId: string;
  axis: Interval;
  hours: number[];
  now: number | null;
  assignments: PAssignment[];
  idx: Indexes;
  canEdit: boolean;
  open: (s: Sheet) => void;
  updateTime: Props["updateTime"];
  notifyError: Props["notifyError"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const quarters: number[] = [];
  for (let t = axis.startMin; t < axis.endMin; t += 15) if (t % 60 !== 0) quarters.push(t);

  return (
    <div
      ref={ref}
      className={`relative h-16 flex-1 ${disabled ? "bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_8px,#e2e8f0_8px,#e2e8f0_16px)]" : canEdit ? "cursor-copy" : ""}`}
      onClick={(e) => {
        // Klick in freien Bereich: Baustelle für dieses Fahrzeug einplanen
        if (canEdit && !disabled && e.target === e.currentTarget) open({ kind: "pickSite", date, vehicleId });
      }}
      title={disabled ? "Fahrzeug nicht verfügbar" : canEdit ? "In freien Bereich klicken: Baustelle einplanen" : undefined}
    >
      {quarters.map((q) => (
        <span key={q} className="pointer-events-none absolute inset-y-0 border-l border-slate-100" style={{ left: `${toPercent(q, axis)}%` }} />
      ))}
      {hours.map((h) => (
        <span key={h} className="pointer-events-none absolute inset-y-0 border-l border-slate-300" style={{ left: `${toPercent(h, axis)}%` }} />
      ))}
      {now !== null && now >= axis.startMin && now <= axis.endMin && (
        <span className="pointer-events-none absolute inset-y-0 z-[5] border-l-2 border-brand-600" style={{ left: `${toPercent(now, axis)}%` }} title="Jetzt" />
      )}
      {assignments.map((a) => (
        <Bar
          key={a.id}
          assignment={a}
          row={assignments}
          axis={axis}
          trackRef={ref}
          idx={idx}
          canEdit={canEdit}
          onOpen={() => open({ kind: "vehicle", date, vehicleId, assignmentId: a.id })}
          updateTime={updateTime}
          notifyError={notifyError}
        />
      ))}
    </div>
  );
}

type DragState = { mode: DragMode; startX: number; ppm: number; preview: Interval; moved: boolean; pointerId: number };

function Bar({
  assignment: a,
  row,
  axis,
  trackRef,
  idx,
  canEdit,
  onOpen,
  updateTime,
  notifyError,
}: {
  assignment: PAssignment;
  row: PAssignment[];
  axis: Interval;
  trackRef: React.RefObject<HTMLDivElement | null>;
  idx: Indexes;
  canEdit: boolean;
  onOpen: () => void;
  updateTime: Props["updateTime"];
  notifyError: Props["notifyError"];
}) {
  const site = idx.sites.get(a.siteId);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Nach dem Speichern bis zum Neuladen an der neuen Position anzeigen
  const [pending, setPending] = useState<{ version: number; iv: Interval } | null>(null);
  const shown: Interval = drag?.preview ?? (pending && pending.version === a.version ? pending.iv : { startMin: a.startMin, endMin: a.endMin });
  const clash = drag ? collides(row, a.id, drag.preview) : undefined;
  const color = site?.color ?? "#64748b";
  const fg = textOn(color);

  function begin(e: React.PointerEvent, mode: DragMode) {
    if (!canEdit || e.button !== 0) return;
    e.stopPropagation();
    const width = trackRef.current?.getBoundingClientRect().width ?? 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ mode, startX: e.clientX, ppm: width / (axis.endMin - axis.startMin), preview: { startMin: a.startMin, endMin: a.endMin }, moved: false, pointerId: e.pointerId });
  }

  function move(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const preview = applyDrag({ startMin: a.startMin, endMin: a.endMin }, drag.mode, pxToMinutes(dx, drag.ppm));
    setDrag({ ...drag, preview, moved: drag.moved || Math.abs(dx) > 4 });
  }

  async function end(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      onOpen();
      return;
    }
    if (d.preview.startMin === a.startMin && d.preview.endMin === a.endMin) return;
    const hit = collides(row, a.id, d.preview);
    if (hit) {
      notifyError(`Überschneidet sich mit ${timeRange(hit.startMin, hit.endMin)} (${idx.sites.get(hit.siteId)?.name ?? "Einsatz"}) – nicht gespeichert.`);
      return;
    }
    const ask = fixedConfirmText(a, `auf ${timeRange(d.preview.startMin, d.preview.endMin)} ändern`);
    if (ask && !confirm(ask)) return;
    setPending({ version: a.version, iv: d.preview });
    const res = await updateTime(a, d.preview);
    if (!res.ok) setPending(null);
  }

  const left = toPercent(Math.max(shown.startMin, axis.startMin), axis);
  const width = toPercent(Math.min(shown.endMin, axis.endMin), axis) - left;
  const by = a.updatedById ? idx.planners.get(a.updatedById) : undefined;
  const label = `${site?.name ?? "?"} · ${timeRange(shown.startMin, shown.endMin)}${a.fixed ? ` · ${fixedLabel(a)}${a.fixedNote ? ` (${a.fixedNote})` : ""}` : ""}${by ? ` · geplant von ${by.initials}` : ""}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      title={canEdit ? `${label}\nZiehen: verschieben · Ränder ziehen: Länge ändern · Klick: Aktionen` : label}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      onPointerDown={(e) => (canEdit ? begin(e, "move") : undefined)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => setDrag(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (!canEdit) onOpen();
      }}
      className={`absolute top-2 bottom-2 z-10 flex items-center overflow-hidden rounded-md shadow ring-1 ring-black/20 select-none ${canEdit ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"} ${
        drag ? "z-[15] shadow-xl" : ""
      } ${clash ? "ring-4 ring-red-600" : a.fixed ? "ring-4 ring-amber-400" : ""} ${pending && pending.version === a.version ? "opacity-70" : ""}`}
      style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%`, backgroundColor: color, color: fg }}
    >
      {canEdit && (
        <span
          onPointerDown={(e) => begin(e, "start")}
          className="absolute inset-y-0 left-0 w-3 cursor-ew-resize touch-none bg-black/15 hover:bg-black/30 md:w-2"
          aria-hidden
        />
      )}
      {a.fixed && a.fixedTimeMin !== null && a.fixedTimeMin !== undefined && a.fixedTimeMin >= shown.startMin && a.fixedTimeMin <= shown.endMin && (
        <span
          className="pointer-events-none absolute inset-y-0 w-1 bg-amber-300 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${((a.fixedTimeMin - shown.startMin) / (shown.endMin - shown.startMin)) * 100}%` }}
          aria-hidden
        />
      )}
      <span className="relative min-w-0 truncate px-3 text-xs leading-tight font-bold">
        {a.fixed && <span className="mr-1 rounded bg-amber-400 px-1 text-amber-950">{fixedLabel(a)}</span>}
        {site?.name}
        <span className="block font-mono font-semibold opacity-90">
          {timeRange(shown.startMin, shown.endMin)}
          {by && <span className="ml-1 opacity-80">✎ {by.initials}</span>}
          {clash && <span className="ml-1 rounded bg-red-700 px-1 text-white">Überschneidung</span>}
        </span>
      </span>
      {canEdit && (
        <span
          onPointerDown={(e) => begin(e, "end")}
          className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none bg-black/15 hover:bg-black/30 md:w-2"
          aria-hidden
        />
      )}
    </div>
  );
}
