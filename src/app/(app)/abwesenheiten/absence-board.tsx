"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageBar, useSave } from "@/components/masterdata/shared";
import { QualificationBadge } from "@/components/qualification-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { api } from "@/lib/api-client";
import { addMonths, eachDay, formatDayLong, isoWeek, formatMonth, formatRange, isWeekend, weekdayShort } from "@/lib/dates";
import { holidayName } from "@/lib/holidays";
import { OutageForm, type OutageValue } from "@/components/outage-form";
import { outageLabel, QUALIFICATION_BADGES, QUALIFICATION_GROUP_LABELS, QUALIFICATION_GROUP_ORDER, qualificationRank, type Qualification } from "@/lib/constants";

type Absence = {
  id: string;
  employeeId: string;
  typeId: string;
  startDate: string;
  endDate: string;
  note: string | null;
  withVehicle: boolean;
  version: number;
  type: { id: string; name: string; code: string; color: string };
  employee: { id: string; firstName: string; lastName: string; shortName: string };
};
type Department = { id: string; name: string; color: string; sortOrder: number };
type AbsenceType = { id: string; name: string; code: string; color: string; active: boolean };
type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  shortName: string;
  active: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
  qualification?: string;
  department: Department;
};
const inPeriod = (e: Employee, d: string) => (!e.availableFrom || e.availableFrom <= d) && (!e.availableUntil || e.availableUntil >= d);

type Selection = { employeeId: string; anchor: string; current: string; mode: "drag" | "tap" };
type VehicleRow = { id: string; licensePlate: string; name: string; ownerId: string | null; departmentId: string | null };
type Outage = OutageValue & { vehicle: { id: string; licensePlate: string; name: string } };
type OutageDialog = { vehicle: VehicleRow; outage: Outage | null; start?: string; end?: string } | null;
/** Fahrzeug-Zeilen nutzen dieselbe Auswahl-Logik; Schlüssel "veh:<id>" */
const VEH = "veh:";
type DialogState = { kind: "create"; employeeId: string | null; start: string; end: string } | { kind: "edit"; absence: Absence } | null;

export function AbsenceBoard(props: {
  from: string;
  to: string;
  today: string;
  departmentFilter: string;
  /** Qualifikationen (leer = alle), Mehrfachauswahl */
  qualiFilter: string[];
  view: "table" | "list";
  /** Tabellenzeilen gruppieren nach Qualifikation (Standard) oder Abteilung */
  grouping: "quali" | "abteilung";
  canEdit: boolean;
  ownEmployeeId: string | null;
  absences: Absence[];
  departments: Department[];
  types: AbsenceType[];
  employees: Employee[];
  /** employeeId -> Kennzeichen der Fahrzeuge, deren Besitzer er ist */
  ownedVehicles: Record<string, string[]>;
  /** Fahrzeug-Ausfälle (Werkstatt …) */
  vehicles: VehicleRow[];
  outages: Outage[];
  canEditOutages: boolean;
}) {
  const { from, to, today, canEdit, absences, departments, types, employees, departmentFilter, qualiFilter, view, grouping, ownEmployeeId, ownedVehicles, vehicles, outages, canEditOutages } = props;
  const [outageDialog, setOutageDialog] = useState<OutageDialog>(null);
  const router = useRouter();
  const page = useSave();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => eachDay(from, to), [from, to]);
  const month = from.slice(0, 7);

  const href = (params: { monat?: string; abteilung?: string; ansicht?: string; gruppe?: string; quali?: string[] }) => {
    const p = new URLSearchParams();
    const m = params.monat ?? month;
    const a = params.abteilung ?? departmentFilter;
    const v = params.ansicht ?? (view === "list" ? "liste" : "");
    const g = params.gruppe ?? (grouping === "abteilung" ? "abteilung" : "");
    if (m) p.set("monat", m);
    if (a) p.set("abteilung", a);
    if (v) p.set("ansicht", v);
    if (g) p.set("gruppe", g);
    const q = params.quali ?? qualiFilter;
    if (q.length) p.set("quali", q.join(","));
    return `/abwesenheiten?${p.toString()}`;
  };

  const matchesFilter = useCallback(
    (e: Employee) =>
      (!departmentFilter || e.department.id === departmentFilter) && (qualiFilter.length === 0 || qualiFilter.includes(e.qualification ?? "GESELLE")),
    [departmentFilter, qualiFilter],
  );
  const toggleQuali = (q: string) => (qualiFilter.includes(q) ? qualiFilter.filter((x) => x !== q) : [...qualiFilter, q]);

  // Mitarbeiter nach Qualifikation (Meister, Gesellen, Azubis …) oder nach Abteilung gruppiert
  const groups = useMemo(() => {
    const filtered = employees.filter((e) => matchesFilter(e));
    const map = new Map<string, { dep: Department; list: Employee[]; quali: boolean }>();
    for (const e of filtered) {
      const q = e.qualification ?? "GESELLE";
      const key = grouping === "quali" ? q : e.department.id;
      if (!map.has(key)) {
        map.set(key, {
          dep:
            grouping === "quali"
              ? { id: q, name: QUALIFICATION_GROUP_LABELS[q as Qualification] ?? q, color: "", sortOrder: qualificationRank(q) }
              : e.department,
          list: [],
          quali: grouping === "quali",
        });
      }
      map.get(key)!.list.push(e);
    }
    const out = [...map.values()].sort((a, b) => a.dep.sortOrder - b.dep.sortOrder || a.dep.name.localeCompare(b.dep.name));
    // innerhalb einer Qualifikation nach Abteilung, dann Name
    if (grouping === "quali") for (const g of out) g.list.sort((a, b) => a.department.sortOrder - b.department.sortOrder || a.lastName.localeCompare(b.lastName));
    return out;
  }, [employees, grouping, matchesFilter]);

  // employeeId -> Tag -> Abwesenheit
  const byCell = useMemo(() => {
    const m = new Map<string, Map<string, Absence>>();
    for (const a of absences) {
      const row = m.get(a.employeeId) ?? new Map<string, Absence>();
      for (const d of eachDay(a.startDate < from ? from : a.startDate, a.endDate > to ? to : a.endDate)) row.set(d, a);
      m.set(a.employeeId, row);
    }
    return m;
  }, [absences, from, to]);

  // Heute in den sichtbaren Bereich scrollen
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>("[data-today]");
    if (el && scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, el.offsetLeft - 160);
  }, [from]);

  function openCreate(employeeId: string | null, a: string, b: string) {
    setDialog({ kind: "create", employeeId, start: a < b ? a : b, end: a < b ? b : a });
  }

  // Ziehen mit der Maus beenden (auch wenn außerhalb der Tabelle losgelassen)
  useEffect(() => {
    if (selection?.mode !== "drag") return;
    const { employeeId, anchor, current } = selection;
    const up = () => {
      const start = anchor < current ? anchor : current;
      const end = anchor < current ? current : anchor;
      if (employeeId.startsWith(VEH)) {
        const v = vehicles.find((x) => x.id === employeeId.slice(VEH.length));
        if (v) setOutageDialog({ vehicle: v, outage: null, start, end });
      } else {
        setDialog({ kind: "create", employeeId, start, end });
      }
      setSelection(null);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [selection, vehicles]);

  // Fahrzeug -> Tag -> Ausfall
  const outageCell = useMemo(() => {
    const m = new Map<string, Map<string, Outage>>();
    for (const o of outages) {
      const row = m.get(o.vehicleId) ?? new Map<string, Outage>();
      for (const d of eachDay(o.startDate < from ? from : o.startDate, o.endDate > to ? to : o.endDate)) row.set(d, o);
      m.set(o.vehicleId, row);
    }
    return m;
  }, [outages, from, to]);
  const shownVehicles = vehicles.filter((v) => !departmentFilter || v.departmentId === departmentFilter);

  function onVehiclePointerDown(e: React.PointerEvent, v: VehicleRow, day: string) {
    if (!canEditOutages || outageCell.get(v.id)?.get(day)) return;
    if (e.pointerType === "mouse") {
      e.preventDefault();
      setSelection({ employeeId: VEH + v.id, anchor: day, current: day, mode: "drag" });
    }
  }
  function onVehicleClick(v: VehicleRow, day: string, pointerType: string) {
    const existing = outageCell.get(v.id)?.get(day);
    if (existing) {
      if (canEditOutages) setOutageDialog({ vehicle: v, outage: existing });
      return;
    }
    if (!canEditOutages || pointerType === "mouse") return;
    if (selection?.mode === "tap" && selection.employeeId === VEH + v.id) {
      setOutageDialog({ vehicle: v, outage: null, start: selection.anchor < day ? selection.anchor : day, end: selection.anchor < day ? day : selection.anchor });
      setSelection(null);
    } else {
      setSelection({ employeeId: VEH + v.id, anchor: day, current: day, mode: "tap" });
    }
  }

  function inSelection(employeeId: string, day: string) {
    if (!selection || selection.employeeId !== employeeId) return false;
    const [s, e] = selection.anchor < selection.current ? [selection.anchor, selection.current] : [selection.current, selection.anchor];
    return day >= s && day <= e;
  }

  function onCellPointerDown(e: React.PointerEvent, employee: Employee, day: string) {
    if (!canEdit || !employee.active || !inPeriod(employee, day)) return;
    const existing = byCell.get(employee.id)?.get(day);
    if (existing) return; // Klick auf bestehende Abwesenheit -> onClick
    if (e.pointerType === "mouse") {
      e.preventDefault();
      setSelection({ employeeId: employee.id, anchor: day, current: day, mode: "drag" });
    }
  }

  function onCellClick(e: React.MouseEvent, employee: Employee, day: string, pointerType: string) {
    const existing = byCell.get(employee.id)?.get(day);
    if (existing) {
      if (canEdit) setDialog({ kind: "edit", absence: existing });
      return;
    }
    if (!canEdit || !employee.active || !inPeriod(employee, day) || pointerType === "mouse") return;
    // Touch: 1. Tippen = Beginn, 2. Tippen in derselben Zeile = Ende
    if (selection?.mode === "tap" && selection.employeeId === employee.id) {
      openCreate(employee.id, selection.anchor, day);
      setSelection(null);
    } else {
      setSelection({ employeeId: employee.id, anchor: day, current: day, mode: "tap" });
    }
  }

  const lastPointerType = useRef("mouse");
  const selectedVehicle = selection?.employeeId.startsWith(VEH) ? vehicles.find((v) => VEH + v.id === selection.employeeId) : null;
  const selectedEmployee = selection
    ? (employees.find((e) => e.id === selection.employeeId) ?? (selectedVehicle ? { shortName: selectedVehicle.licensePlate } : null))
    : null;

  return (
    <div className="space-y-3">
      <MessageBar msg={page.msg} />
      {warnings.length > 0 && (
        <Alert tone="warning">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </Alert>
      )}

      {/* Steuerleiste */}
      <div className="no-print flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-line">
        <div className="flex items-center gap-1">
          <Link href={href({ monat: addMonths(from, -1).slice(0, 7) })} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-white text-xl font-bold hover:bg-slate-50" aria-label="Vorheriger Monat">
            ◀
          </Link>
          <span className="min-w-40 text-center text-lg font-bold">{formatMonth(from)}</span>
          <Link href={href({ monat: addMonths(from, 1).slice(0, 7) })} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-white text-xl font-bold hover:bg-slate-50" aria-label="Nächster Monat">
            ▶
          </Link>
        </div>
        <Link href={href({ monat: today.slice(0, 7) })} className="flex min-h-11 items-center rounded-lg border border-line bg-white px-3 font-semibold hover:bg-slate-50">
          Heute
        </Link>
        <input
          type="month"
          aria-label="Monat wählen"
          value={month}
          onChange={(e) => e.target.value && router.push(href({ monat: e.target.value }))}
          className="min-h-11 rounded-lg border border-line px-2"
        />
        <div className="min-w-40">
          <Select aria-label="Abteilung" value={departmentFilter} onChange={(e) => router.push(href({ abteilung: e.target.value }))}>
            <option value="">Alle Abteilungen</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        {view === "table" && (
          <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Gruppierung">
            <Link href={href({ gruppe: "" })} aria-current={grouping === "quali" ? "page" : undefined} className={`flex min-h-11 items-center px-3 font-semibold ${grouping === "quali" ? "bg-brand-700 text-white" : "bg-white"}`}>
              nach Qualifikation
            </Link>
            <Link href={href({ gruppe: "abteilung" })} aria-current={grouping === "abteilung" ? "page" : undefined} className={`flex min-h-11 items-center px-3 font-semibold ${grouping === "abteilung" ? "bg-brand-700 text-white" : "bg-white"}`}>
              nach Abteilung
            </Link>
          </div>
        )}
        <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Ansicht">
          <Link href={href({ ansicht: "" })} aria-current={view === "table" ? "page" : undefined} className={`flex min-h-11 items-center px-3 font-semibold ${view === "table" ? "bg-brand-700 text-white" : "bg-white"}`}>
            Tabelle
          </Link>
          <Link href={href({ ansicht: "liste" })} aria-current={view === "list" ? "page" : undefined} className={`flex min-h-11 items-center px-3 font-semibold ${view === "list" ? "bg-brand-700 text-white" : "bg-white"}`}>
            Liste
          </Link>
        </div>
        {canEdit && (
          <Button className="ml-auto" onClick={() => openCreate(null, today, today)}>
            + Abwesenheit
          </Button>
        )}
      </div>

      {/* Filter: Qualifikation (Mehrfachauswahl) */}
      <div className="no-print flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter Qualifikation">
        <span className="mr-1 text-sm font-semibold text-muted">Anzeigen:</span>
        <Link
          href={href({ quali: [] })}
          aria-pressed={qualiFilter.length === 0}
          className={`flex min-h-10 items-center rounded-full border px-3 text-sm font-semibold ${qualiFilter.length === 0 ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white hover:bg-slate-50"}`}
        >
          Alle
        </Link>
        {QUALIFICATION_GROUP_ORDER.map((q) => {
          const on = qualiFilter.includes(q);
          return (
            <Link
              key={q}
              href={href({ quali: toggleQuali(q) })}
              aria-pressed={on}
              title={on ? "Filter entfernen" : "Zum Filter hinzufügen"}
              className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${on ? "border-brand-700 bg-brand-50 text-brand-800 ring-1 ring-brand-700" : "border-line bg-white hover:bg-slate-50"}`}
            >
              <span className="font-mono text-xs">{QUALIFICATION_BADGES[q]}</span>
              {QUALIFICATION_GROUP_LABELS[q]}
              {on && <span aria-hidden>✓</span>}
            </Link>
          );
        })}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {types
          .filter((t) => t.active)
          .map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5">
              <span className="rounded px-1.5 font-mono text-xs font-bold leading-5 text-white" style={{ backgroundColor: t.color }}>
                {t.code}
              </span>
              {t.name}
            </span>
          ))}
      </div>

      {canEdit && view === "table" && (
        <p className="no-print text-sm text-muted">
          Neue Abwesenheit: in der Zeile des Mitarbeiters über die Tage ziehen (Maus) bzw. Beginn und Ende antippen (Handy). Klick auf ein Kürzel öffnet die Abwesenheit.
        </p>
      )}

      {selection?.mode === "tap" && selectedEmployee && (
        <div className="fixed inset-x-2 bottom-20 z-40 rounded-xl border-2 border-brand-600 bg-white p-3 shadow-2xl md:inset-x-auto md:right-6 md:bottom-6 md:max-w-md">
          <p className="mb-2 font-semibold leading-snug">
            {selectedEmployee.shortName} ab {formatRange(selection.anchor, selection.anchor)}: letzten Tag antippen
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                if (selectedVehicle) setOutageDialog({ vehicle: selectedVehicle, outage: null, start: selection.anchor, end: selection.anchor });
                else openCreate(selection.employeeId, selection.anchor, selection.anchor);
                setSelection(null);
              }}
            >
              Nur dieser Tag
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setSelection(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {view === "table" ? (
        <div ref={scrollRef} className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-line">
          <table className="border-separate border-spacing-0 text-sm select-none">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-r border-line bg-white" />
                {weekRuns(days).map((r) => (
                  <th key={r.start} colSpan={r.count} className="border-l border-line bg-slate-50 px-0 py-0.5 text-center text-[11px] font-semibold text-muted">
                    {r.count >= 3 ? `KW ${r.week}` : r.week}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 min-w-24 border-b border-r border-line bg-white px-2 py-1 text-left md:min-w-52">Mitarbeiter</th>
                {days.map((d) => (
                  <th
                    key={d}
                    data-today={d === today ? "" : undefined}
                    title={holidayName(d) ?? undefined}
                    className={`min-w-9 border-b border-line px-0 py-1 text-center font-semibold ${isWeekend(d) || holidayName(d) ? "bg-slate-200" : "bg-white"} ${d === today ? "bg-brand-700! text-white" : ""}`}
                  >
                    <div className="text-[11px] leading-tight">{weekdayShort(d)}</div>
                    <div className="leading-tight">{Number(d.slice(8))}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(({ dep, list, quali }) => (
                <Fragment key={dep.id}>
                  <tr>
                    <td colSpan={days.length + 1} className="border-b border-line bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                      <span className="sticky left-2 inline-flex items-center gap-1.5">
                        {quali ? <QualificationBadge q={dep.id} /> : <span className="size-2.5 rounded-full" style={{ backgroundColor: dep.color }} />}
                        {dep.name} ({list.length})
                      </span>
                    </td>
                  </tr>
                  {list.map((e) => {
                    const own = e.id === ownEmployeeId;
                    return (
                      <tr key={e.id} className={own ? "bg-brand-50" : ""}>
                        <th
                          scope="row"
                          className={`sticky left-0 z-10 border-b border-r border-line px-2 py-1 text-left font-normal ${own ? "bg-brand-50" : "bg-white"} ${e.active ? "" : "text-muted line-through"}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: e.department.color }} title={e.department.name} aria-hidden />
                            <span className="font-mono font-bold">{e.shortName}</span>
                            <span className={`hidden truncate md:inline ${own ? "font-bold" : ""}`}>
                              {e.lastName}, {e.firstName}
                            </span>
                            {e.qualification === "PRAKTIKANT" && (
                              <span className="rounded bg-sky-200 px-1 text-[10px] font-bold text-sky-950" title="Praktikant">
                                P
                              </span>
                            )}
                          </span>
                        </th>
                        {days.map((d) => {
                          const a = byCell.get(e.id)?.get(d);
                          const selected = inSelection(e.id, d);
                          return (
                            <td
                              key={d}
                              title={!inPeriod(e, d) ? "nicht im Betrieb" : a ? `${a.type.name}: ${formatRange(a.startDate, a.endDate)}${a.withVehicle ? " – mit Fahrzeug" : ""}${a.note ? ` – ${a.note}` : ""}` : formatDayLong(d)}
                              onPointerDown={(ev) => {
                                lastPointerType.current = ev.pointerType;
                                onCellPointerDown(ev, e, d);
                              }}
                              onPointerEnter={() => {
                                if (selection?.mode === "drag" && selection.employeeId === e.id && !a && inPeriod(e, d)) setSelection({ ...selection, current: d });
                              }}
                              onClick={(ev) => onCellClick(ev, e, d, lastPointerType.current)}
                              className={`h-10 border-b border-line p-0.5 text-center ${
                                !inPeriod(e, d) ? "bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_4px,#e2e8f0_4px,#e2e8f0_8px)]" : isWeekend(d) || holidayName(d) ? "bg-slate-100" : ""
                              } ${d === today ? "border-x-2 border-x-brand-700" : ""} ${canEdit && e.active && inPeriod(e, d) ? "cursor-pointer hover:bg-brand-50" : ""}`}
                            >
                              {a ? (
                                <span
                                  className="flex h-full w-full items-center justify-center rounded font-mono text-xs font-bold text-white"
                                  style={{ backgroundColor: a.type.color }}
                                >
                                  {a.type.code}
                                  {a.withVehicle && <span className="ml-0.5 text-[9px]" aria-label="mit Fahrzeug">🚐</span>}
                                </span>
                              ) : selected ? (
                                <span className="block h-full w-full rounded bg-brand-600/30 ring-2 ring-brand-600" />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
              {shownVehicles.length > 0 && (
                <>
                  <tr>
                    <td colSpan={days.length + 1} className="border-b border-line bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                      <span className="sticky left-2 inline-flex items-center gap-1.5">🚐 Fahrzeuge{canEditOutages ? " – Werkstatt/Ausfall: über die Tage ziehen" : ""}</span>
                    </td>
                  </tr>
                  {shownVehicles.map((v) => {
                    const key = VEH + v.id;
                    return (
                      <tr key={key}>
                        <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-white px-2 py-1 text-left font-normal">
                          <span className="flex items-center gap-1.5">
                            <span className="rounded border-2 border-ink px-1 font-mono text-xs leading-4 font-bold whitespace-nowrap">{v.licensePlate}</span>
                            <span className="hidden truncate md:inline">{v.name}</span>
                          </span>
                        </th>
                        {days.map((d) => {
                          const o = outageCell.get(v.id)?.get(d);
                          const ownerAway = !o && v.ownerId ? byCell.get(v.ownerId)?.get(d) : undefined;
                          const withOwner = ownerAway?.withVehicle ? ownerAway : undefined;
                          const selected = inSelection(key, d);
                          return (
                            <td
                              key={d}
                              title={
                                o
                                  ? `${outageLabel(o.reason)}: ${formatRange(o.startDate, o.endDate)}${o.note ? ` – ${o.note}` : ""}`
                                  : withOwner
                                    ? `mit ${withOwner.employee.firstName} ${withOwner.employee.lastName} abwesend (${withOwner.type.name})`
                                    : formatDayLong(d)
                              }
                              onPointerDown={(ev) => {
                                lastPointerType.current = ev.pointerType;
                                onVehiclePointerDown(ev, v, d);
                              }}
                              onPointerEnter={() => {
                                if (selection?.mode === "drag" && selection.employeeId === key && !o) setSelection({ ...selection, current: d });
                              }}
                              onClick={() => onVehicleClick(v, d, lastPointerType.current)}
                              className={`h-10 border-b border-line p-0.5 text-center ${isWeekend(d) || holidayName(d) ? "bg-slate-100" : ""} ${d === today ? "border-x-2 border-x-brand-700" : ""} ${
                                canEditOutages ? "cursor-pointer hover:bg-brand-50" : ""
                              }`}
                            >
                              {o ? (
                                <span className="flex h-full w-full items-center justify-center rounded bg-slate-700 text-xs font-bold text-white">🔧</span>
                              ) : withOwner ? (
                                <span className="flex h-full w-full items-center justify-center rounded bg-slate-200 font-mono text-[10px] font-bold text-slate-600">{withOwner.type.code}🚐</span>
                              ) : selected ? (
                                <span className="block h-full w-full rounded bg-brand-600/30 ring-2 ring-brand-600" />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              )}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={days.length + 1} className="p-6 text-center text-muted">
                    Keine Mitarbeiter gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <AbsenceList
          absences={absences.filter((a) => { const e = employees.find((x) => x.id === a.employeeId); return !e || matchesFilter(e); })}
          canEdit={canEdit}
          ownEmployeeId={ownEmployeeId}
          onEdit={(a) => setDialog({ kind: "edit", absence: a })}
        />
      )}

      <Dialog open={outageDialog !== null} onClose={() => setOutageDialog(null)} title={outageDialog?.outage ? "🔧 Ausfall bearbeiten" : "🔧 Ausfall eintragen"}>
        {outageDialog && (
          <OutageForm
            key={outageDialog.outage?.id ?? `${outageDialog.vehicle.id}-${outageDialog.start}`}
            vehicle={outageDialog.vehicle}
            outage={outageDialog.outage}
            defaultStart={outageDialog.start}
            defaultEnd={outageDialog.end}
            onCancel={() => setOutageDialog(null)}
            onDone={(text) => {
              setOutageDialog(null);
              page.setMsg({ tone: "success", text });
              router.refresh();
            }}
          />
        )}
      </Dialog>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog?.kind === "edit" ? "Abwesenheit bearbeiten" : "Abwesenheit eintragen"}>
        {dialog && (
          <AbsenceForm
            key={dialog.kind === "edit" ? dialog.absence.id : `${dialog.employeeId}-${dialog.start}`}
            state={dialog}
            types={types}
            employees={employees.filter((e) => e.active)}
            ownedVehicles={ownedVehicles}
            onCancel={() => setDialog(null)}
            onDone={(text, w) => {
              setDialog(null);
              setWarnings(w);
              page.setMsg({ tone: "success", text });
              router.refresh();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function AbsenceList({ absences, canEdit, ownEmployeeId, onEdit }: { absences: Absence[]; canEdit: boolean; ownEmployeeId: string | null; onEdit: (a: Absence) => void }) {
  if (absences.length === 0) return <div className="rounded-xl bg-white p-6 text-center text-muted ring-1 ring-line">Keine Abwesenheiten in diesem Monat.</div>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line">
      {absences.map((a) => (
        <li key={a.id} className={`flex items-center gap-3 p-3 ${a.employeeId === ownEmployeeId ? "bg-brand-50" : ""}`}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg font-mono font-bold text-white" style={{ backgroundColor: a.type.color }}>
            {a.type.code}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-bold">
              {a.employee.lastName}, {a.employee.firstName} <span className="font-mono text-sm text-muted">{a.employee.shortName}</span>
            </div>
            <div className="text-sm text-muted">
              {a.type.name} · {formatRange(a.startDate, a.endDate)}
              {a.withVehicle && " · 🚐 mit Fahrzeug (nicht verfügbar)"}
              {a.note && ` · ${a.note}`}
            </div>
          </div>
          {canEdit && (
            <Button variant="secondary" onClick={() => onEdit(a)}>
              Bearbeiten
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function AbsenceForm({
  state,
  types,
  employees,
  ownedVehicles,
  onCancel,
  onDone,
}: {
  state: NonNullable<DialogState>;
  types: AbsenceType[];
  employees: Employee[];
  ownedVehicles: Record<string, string[]>;
  onCancel: () => void;
  onDone: (msg: string, warnings: string[]) => void;
}) {
  const form = useSave();
  const editing = state.kind === "edit" ? state.absence : null;
  const [typeId, setTypeId] = useState(editing?.typeId ?? types.find((t) => t.active)?.id ?? "");
  const [start, setStart] = useState(editing?.startDate ?? (state.kind === "create" ? state.start : ""));
  const [end, setEnd] = useState(editing?.endDate ?? (state.kind === "create" ? state.end : ""));
  const fixedEmployee = editing ? editing.employee : state.kind === "create" && state.employeeId ? employees.find((e) => e.id === state.employeeId) : null;
  const [pickedEmployee, setPickedEmployee] = useState("");
  const employeeId = fixedEmployee?.id ?? pickedEmployee;
  const plates = employeeId ? (ownedVehicles[employeeId] ?? []) : [];
  // Fahrzeug-Besitzer müssen bewusst wählen (beim Bearbeiten vorbelegt)
  const [withVehicle, setWithVehicle] = useState<"yes" | "no" | "">(editing ? (editing.withVehicle ? "yes" : "no") : "");
  const selectable = types.filter((t) => t.active || t.id === editing?.typeId);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const note = String(f.get("note") ?? "").trim() || null;
    let warnings: string[] = [];
    const ok = await form.run(async () => {
      const vehicleFlag = plates.length ? { withVehicle: withVehicle === "yes" } : {};
      const res = editing
        ? await api<{ warnings: string[] }>(`/api/absences/${editing.id}`, {
            method: "PATCH",
            body: { version: editing.version, typeId, startDate: start, endDate: end, note, ...vehicleFlag },
          })
        : await api<{ warnings: string[] }>("/api/absences", {
            body: { employeeId: fixedEmployee?.id ?? f.get("employeeId"), typeId, startDate: start, endDate: end, note, ...vehicleFlag },
          });
      warnings = res.warnings ?? [];
    }, "");
    const t = types.find((x) => x.id === typeId);
    if (ok) onDone(`${t?.name ?? "Abwesenheit"} ${formatRange(start, end)} gespeichert.`, warnings);
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {form.msg?.tone === "error" && <MessageBar msg={form.msg} />}
      {fixedEmployee ? (
        <p className="text-lg font-bold">
          {fixedEmployee.firstName} {fixedEmployee.lastName} <span className="font-mono text-base text-muted">{fixedEmployee.shortName}</span>
        </p>
      ) : (
        <Field label="Mitarbeiter">
          <Select name="employeeId" required value={pickedEmployee} onChange={(e) => setPickedEmployee(e.target.value)}>
            <option value="" disabled>
              – bitte wählen –
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.lastName}, {e.firstName} ({e.shortName})
              </option>
            ))}
          </Select>
        </Field>
      )}
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Art</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {selectable.map((t) => (
            <label
              key={t.id}
              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 px-2 ${typeId === t.id ? "border-ink bg-slate-50" : "border-line"}`}
            >
              <input type="radio" name="typeId" value={t.id} checked={typeId === t.id} onChange={() => setTypeId(t.id)} className="sr-only" />
              <span className="shrink-0 rounded px-1.5 font-mono text-xs font-bold leading-6 text-white" style={{ backgroundColor: t.color }}>
                {t.code}
              </span>
              <span className="min-w-0 text-sm leading-tight font-semibold break-words hyphens-auto">{t.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="von">
          <Input
            type="date"
            value={start}
            required
            onChange={(e) => {
              setStart(e.target.value);
              if (end && e.target.value > end) setEnd(e.target.value);
            }}
          />
        </Field>
        <Field label="bis (einschließlich)">
          <Input type="date" value={end} min={start} required onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      {plates.length > 0 && (
        <fieldset className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
          <legend className="px-1 text-sm font-bold">Fahrzeug {plates.join(", ")} – was passiert damit?</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="radio" name="withVehicle" className="size-5 accent-brand-600" checked={withVehicle === "no"} onChange={() => setWithVehicle("no")} required />
            <span>
              <strong>Fahrzeug bleibt da</strong> – andere können damit fahren
            </span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="radio" name="withVehicle" className="size-5 accent-brand-600" checked={withVehicle === "yes"} onChange={() => setWithVehicle("yes")} />
            <span>
              <strong>Fahrzeug ist mit abwesend</strong> – in dieser Zeit nicht einplanbar
            </span>
          </label>
        </fieldset>
      )}
      <Field label="Notiz (optional)">
        <Input name="note" defaultValue={editing?.note ?? ""} maxLength={300} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        {editing ? (
          <Button
            variant="danger"
            disabled={form.busy}
            onClick={async () => {
              if (!confirm("Diese Abwesenheit wirklich löschen?")) return;
              const ok = await form.run(() => api(`/api/absences/${editing.id}`, { method: "DELETE", body: { version: editing.version } }), "");
              if (ok) onDone("Abwesenheit gelöscht.", []);
            }}
          >
            Löschen
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={form.busy || !typeId || (plates.length > 0 && !withVehicle)}>
            {form.busy ? "Speichern …" : "Speichern"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Aufeinanderfolgende Tage derselben Kalenderwoche zusammenfassen (Kopfzeile). */
function weekRuns(days: string[]): { start: string; week: number; count: number }[] {
  const runs: { start: string; week: number; count: number }[] = [];
  for (const d of days) {
    const w = isoWeek(d);
    const last = runs[runs.length - 1];
    if (last && last.week === w) last.count++;
    else runs.push({ start: d, week: w, count: 1 });
  }
  return runs;
}
