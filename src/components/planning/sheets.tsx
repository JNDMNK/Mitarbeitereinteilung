"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { QualificationBadge } from "@/components/qualification-badge";
import { formatDayShort, formatRange, mapsUrl } from "@/lib/dates";
import { QUALIFICATION_LABELS, type Qualification } from "@/lib/constants";
import { findOverlap, suggestSlot, timeRange } from "@/lib/planning-logic";
import type { PlanningAction } from "@/lib/planning-schemas";
import type { PlanningData } from "@/lib/planning-types";
import type { DayView, Indexes } from "@/lib/planning-view";
import { formatMinutes, gridOptions } from "@/lib/time";

export type Sheet =
  | { kind: "employee"; date: string; employeeId: string }
  | { kind: "vehicle"; date: string; vehicleId: string; assignmentId?: string }
  | { kind: "pickVehicleForEmployee"; date: string; employeeId: string }
  | { kind: "pickEmployeeForVehicle"; date: string; vehicleId: string }
  | { kind: "pickSite"; date: string; vehicleId: string; assignmentId?: string }
  | { kind: "pickVehicleForSite"; date: string; siteId: string }
  | { kind: "pickSiteForDay"; date: string }
  | { kind: "time"; date: string; vehicleId: string; siteId: string; assignmentId?: string };

type Run = (action: PlanningAction, body: unknown, success?: string) => Promise<boolean>;

type Props = {
  sheet: Sheet | null;
  setSheet: (s: Sheet | null) => void;
  data: PlanningData;
  idx: Indexes;
  days: Map<string, DayView>;
  canEdit: boolean;
  run: Run;
  busy: boolean;
};

/** Große, gut tippbare Aktionszeile */
function Action({ onClick, children, tone = "default", disabled }: { onClick: () => void; children: ReactNode; tone?: "default" | "danger"; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-4 py-2 text-left text-base font-semibold disabled:opacity-50 ${
        tone === "danger" ? "border-red-300 text-red-800 hover:bg-red-50" : "border-line hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function SearchList<T>({
  items,
  filter,
  render,
  empty,
  placeholder,
}: {
  items: { group: string; list: T[] }[];
  filter: (item: T, q: string) => boolean;
  render: (item: T) => ReactNode;
  empty: string;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const groups = items.map((g) => ({ ...g, list: g.list.filter((i) => filter(i, q.trim().toLowerCase())) })).filter((g) => g.list.length > 0);
  return (
    <div className="space-y-3">
      <Input type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="max-h-[55vh] space-y-3 overflow-y-auto">
        {groups.length === 0 && <p className="p-4 text-center text-muted">{empty}</p>}
        {groups.map((g) => (
          <section key={g.group}>
            <h3 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">{g.group}</h3>
            <div className="space-y-1.5">{g.list.map(render)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function PlanningSheets({ sheet, setSheet, data, idx, days, canEdit, run, busy }: Props) {
  const close = () => setSheet(null);
  if (!sheet) return <Dialog open={false} onClose={close} title="">{null}</Dialog>;
  const day = days.get(sheet.date);
  if (!day) return null;
  const dateLabel = formatDayShort(sheet.date);

  // ---------------- Mitarbeiter ----------------
  if (sheet.kind === "employee") {
    const e = idx.employees.get(sheet.employeeId)!;
    const vehicleId = day.seatOf.get(e.id) ?? null;
    const vehicle = vehicleId ? idx.vehicles.get(vehicleId) : null;
    const absent = day.absent.find((a) => a.employee.id === e.id);
    return (
      <Dialog open onClose={close} title={`${e.firstName} ${e.lastName}`}>
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-muted">
            <QualificationBadge q={e.qualification} /> {QUALIFICATION_LABELS[e.qualification as Qualification]} · {idx.departments.get(e.departmentId)?.name} · {dateLabel}
          </p>
          <p className="font-semibold">{vehicle ? `Eingeteilt auf ${vehicle.licensePlate} (${vehicle.name})` : "Nicht eingeteilt"}</p>
          {absent && (
            <p className="rounded-lg bg-red-50 p-2 font-semibold text-red-800">
              Abwesend: {absent.type?.name} {formatRange(absent.absence.startDate, absent.absence.endDate)}
            </p>
          )}
          {e.phone && (
            <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-12 items-center gap-3 rounded-lg border border-line px-4 font-semibold text-brand-700">
              📞 {e.phone}
            </a>
          )}
          {canEdit && (
            <>
              <Action onClick={() => setSheet({ kind: "pickVehicleForEmployee", date: sheet.date, employeeId: e.id })}>
                🚐 {vehicle ? "Auf anderes Fahrzeug setzen …" : "Zuweisen zu Fahrzeug …"}
              </Action>
              {vehicle && (
                <Action
                  disabled={busy}
                  onClick={async () => {
                    close();
                    await run("crew-remove", { date: sheet.date, employeeId: e.id, expectedFromVehicleId: vehicle.id }, `${e.firstName} ${e.lastName} zurück in den Pool.`);
                  }}
                >
                  ↩ Zurück in den Pool
                </Action>
              )}
            </>
          )}
        </div>
      </Dialog>
    );
  }

  // ---------------- Fahrzeug ----------------
  if (sheet.kind === "vehicle") {
    const v = idx.vehicles.get(sheet.vehicleId)!;
    const vd = data.vehicleDays.find((x) => x.date === sheet.date && x.vehicleId === v.id) ?? null;
    const a = sheet.assignmentId ? vd?.assignments.find((x) => x.id === sheet.assignmentId) : undefined;
    const site = a ? idx.sites.get(a.siteId) : undefined;
    return (
      <Dialog open onClose={close} title={`${v.licensePlate} · ${v.name}`}>
        <div className="space-y-2">
          <p className="text-muted">
            {dateLabel}
            {site && a ? ` · ${site.name}, ${timeRange(a.startMin, a.endMin)}` : vd?.assignments.length ? ` · ${vd.assignments.length} Einsatz/Einsätze` : " · ohne Baustelle"}
          </p>
          {canEdit ? (
            <>
              {a && site && (
                <>
                  <Action onClick={() => setSheet({ kind: "time", date: sheet.date, vehicleId: v.id, siteId: site.id, assignmentId: a.id })}>🕒 Zeit ändern …</Action>
                  <Action onClick={() => setSheet({ kind: "pickSite", date: sheet.date, vehicleId: v.id, assignmentId: a.id })}>🏗️ Andere Baustelle …</Action>
                </>
              )}
              <Action onClick={() => setSheet({ kind: "pickSite", date: sheet.date, vehicleId: v.id })}>➕ {vd?.assignments.length ? "Weitere Baustelle einplanen …" : "Auf Baustelle einplanen …"}</Action>
              <Action onClick={() => setSheet({ kind: "pickEmployeeForVehicle", date: sheet.date, vehicleId: v.id })}>👷 Mitarbeiter hinzufügen …</Action>
              {a && site && (
                <Action
                  disabled={busy}
                  onClick={async () => {
                    close();
                    await run("assignment-delete", { id: a.id, version: a.version }, `${v.licensePlate} von „${site.name}“ entfernt.`);
                  }}
                >
                  ✕ Von dieser Baustelle entfernen
                </Action>
              )}
              {vd && (
                <Action
                  tone="danger"
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm(`${v.licensePlate} für ${dateLabel} freigeben? Besatzung geht zurück in den Pool, alle Einsätze des Fahrzeugs an diesem Tag werden entfernt.`)) return;
                    close();
                    await run("vehicle-release", { date: sheet.date, vehicleId: v.id, version: vd.version }, `${v.licensePlate} freigegeben.`);
                  }}
                >
                  🗑 Fahrzeug für diesen Tag freigeben
                </Action>
              )}
            </>
          ) : (
            site?.address && (
              <a href={mapsUrl(site.address)} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 rounded-lg border border-line px-4 font-semibold text-brand-700">
                📍 Navigation starten
              </a>
            )
          )}
        </div>
      </Dialog>
    );
  }

  // ---------------- Fahrzeug für Mitarbeiter wählen ----------------
  if (sheet.kind === "pickVehicleForEmployee") {
    const e = idx.employees.get(sheet.employeeId)!;
    const from = day.seatOf.get(e.id) ?? null;
    const onSite = day.sites.flatMap((g) => g.items.map((i) => ({ slot: i, label: g.site.name })));
    const seen = new Set<string>();
    const deployed = onSite.filter((x) => (seen.has(x.slot.vehicle.id) ? false : (seen.add(x.slot.vehicle.id), true)));
    const groups = [
      { group: "Auf Baustelle", list: deployed.map((x) => ({ vehicle: x.slot.vehicle, crew: x.slot.crew.length, info: x.label })) },
      { group: "Ohne Baustelle", list: day.poolVehicles.map((p) => ({ vehicle: p.vehicle, crew: p.crew.length, info: p.crew.length ? "mit Besatzung" : "frei" })) },
    ];
    return (
      <Dialog open onClose={close} title={`${e.firstName} ${e.lastName} → Fahrzeug`}>
        <SearchList
          items={groups}
          placeholder="Kennzeichen oder Bezeichnung"
          empty="Keine Fahrzeuge gefunden."
          filter={(x, q) => !q || `${x.vehicle.licensePlate} ${x.vehicle.name} ${x.info}`.toLowerCase().includes(q)}
          render={(x) => (
            <Action
              key={x.vehicle.id}
              disabled={busy || x.vehicle.id === from}
              onClick={async () => {
                close();
                await run("crew-assign", { date: sheet.date, employeeId: e.id, vehicleId: x.vehicle.id, expectedFromVehicleId: from }, `${e.firstName} ${e.lastName} → ${x.vehicle.licensePlate}.`);
              }}
            >
              <span className="rounded border-2 border-ink px-1.5 font-mono text-sm font-bold">{x.vehicle.licensePlate}</span>
              <span className="flex-1 truncate">
                {x.vehicle.name} <span className="text-sm font-normal text-muted">· {x.info}</span>
              </span>
              <span className={`rounded-full px-2 text-xs font-bold ${x.crew >= x.vehicle.seats ? "bg-amber-200" : "bg-slate-200"}`}>
                {x.crew}/{x.vehicle.seats}
              </span>
            </Action>
          )}
        />
      </Dialog>
    );
  }

  // ---------------- Mitarbeiter für Fahrzeug wählen ----------------
  if (sheet.kind === "pickEmployeeForVehicle") {
    const v = idx.vehicles.get(sheet.vehicleId)!;
    const available = day.poolEmployees.filter((p) => !p.absence).map((p) => p.employee);
    const absent = day.poolEmployees.filter((p) => p.absence).map((p) => p.employee);
    const elsewhere = data.employees.filter((e) => e.active && day.seatOf.has(e.id) && day.seatOf.get(e.id) !== v.id);
    return (
      <Dialog open onClose={close} title={`Mitarbeiter auf ${v.licensePlate}`}>
        <SearchList
          items={[
            { group: "Verfügbar", list: available },
            { group: "Schon eingeteilt (wird umgesetzt)", list: elsewhere },
            { group: "Abwesend", list: absent },
          ]}
          placeholder="Name oder Kürzel"
          empty="Keine Mitarbeiter gefunden."
          filter={(e, q) => !q || `${e.firstName} ${e.lastName} ${e.shortName}`.toLowerCase().includes(q)}
          render={(e) => {
            const from = day.seatOf.get(e.id) ?? null;
            const abs = day.absent.find((a) => a.employee.id === e.id);
            return (
              <Action
                key={e.id}
                disabled={busy}
                onClick={async () => {
                  close();
                  await run("crew-assign", { date: sheet.date, employeeId: e.id, vehicleId: v.id, expectedFromVehicleId: from }, `${e.firstName} ${e.lastName} → ${v.licensePlate}.`);
                }}
              >
                <span className="h-6 w-1 rounded-full" style={{ backgroundColor: idx.departments.get(e.departmentId)?.color }} />
                <span className="flex-1 truncate">
                  {e.lastName}, {e.firstName} <span className="font-mono text-sm text-muted">{e.shortName}</span>
                  {from && <span className="text-sm font-normal text-muted"> · {idx.vehicles.get(from)?.licensePlate}</span>}
                </span>
                {abs && (
                  <span className="rounded px-1 font-mono text-xs font-bold text-white" style={{ backgroundColor: abs.type?.color }}>
                    {abs.type?.code}
                  </span>
                )}
                <QualificationBadge q={e.qualification} />
              </Action>
            );
          }}
        />
      </Dialog>
    );
  }

  // ---------------- Baustelle wählen ----------------
  if (sheet.kind === "pickSite" || sheet.kind === "pickSiteForDay") {
    const usedToday = new Set(day.sites.map((g) => g.site.id));
    const active = data.sites.filter((s) => s.active && s.status !== "DONE");
    const groups = [
      { group: "Heute schon eingeplant", list: active.filter((s) => usedToday.has(s.id)) },
      { group: "Aktiv", list: active.filter((s) => !usedToday.has(s.id) && s.status === "ACTIVE") },
      { group: "Geplant", list: active.filter((s) => !usedToday.has(s.id) && s.status === "PLANNED") },
    ];
    const vehicle = sheet.kind === "pickSite" ? idx.vehicles.get(sheet.vehicleId) : null;
    const assignment = sheet.kind === "pickSite" && sheet.assignmentId ? data.vehicleDays.flatMap((v) => v.assignments).find((a) => a.id === sheet.assignmentId) : undefined;
    return (
      <Dialog open onClose={close} title={vehicle ? `${vehicle.licensePlate} → Baustelle` : `Baustelle einplanen · ${dateLabel}`}>
        <SearchList
          items={groups}
          placeholder="Name, Kunde, Adresse"
          empty="Keine Baustellen gefunden."
          filter={(s, q) => !q || `${s.name} ${s.customer ?? ""} ${s.address ?? ""} ${s.orderNumber ?? ""}`.toLowerCase().includes(q)}
          render={(s) => {
            const outside = (s.startDate && sheet.date < s.startDate) || (s.endDate && sheet.date > s.endDate);
            return (
              <Action
                key={s.id}
                disabled={busy || assignment?.siteId === s.id}
                onClick={async () => {
                  if (sheet.kind === "pickSiteForDay") return setSheet({ kind: "pickVehicleForSite", date: sheet.date, siteId: s.id });
                  if (assignment) {
                    close();
                    await run("assignment-update", { id: assignment.id, version: assignment.version, siteId: s.id }, `Einsatz auf „${s.name}“ verschoben.`);
                    return;
                  }
                  setSheet({ kind: "time", date: sheet.date, vehicleId: sheet.vehicleId, siteId: s.id });
                }}
              >
                <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.name}</span>
                  <span className="block truncate text-sm font-normal text-muted">{[s.customer, s.address].filter(Boolean).join(" · ") || "–"}</span>
                </span>
                {outside && <span className="text-xs font-bold text-amber-800">außerhalb Zeitraum</span>}
              </Action>
            );
          }}
        />
      </Dialog>
    );
  }

  // ---------------- Fahrzeug für Baustelle wählen ----------------
  if (sheet.kind === "pickVehicleForSite") {
    const site = idx.sites.get(sheet.siteId)!;
    const deployed = new Map<string, { vehicle: (typeof data.vehicles)[number]; crew: number; info: string }>();
    for (const g of day.sites) for (const i of g.items) if (!deployed.has(i.vehicle.id)) deployed.set(i.vehicle.id, { vehicle: i.vehicle, crew: i.crew.length, info: `${g.site.name} ${timeRange(i.assignment.startMin, i.assignment.endMin)}` });
    return (
      <Dialog open onClose={close} title={`Fahrzeug für „${site.name}“`}>
        <SearchList
          items={[
            { group: "Ohne Baustelle", list: day.poolVehicles.map((p) => ({ vehicle: p.vehicle, crew: p.crew.length, info: p.crew.length ? p.crew.map((c) => c.shortName).join(", ") : "frei – Standard-Besatzung wird vorbelegt" })) },
            { group: "Schon im Einsatz (weiterer Einsatz)", list: [...deployed.values()] },
          ]}
          placeholder="Kennzeichen oder Bezeichnung"
          empty="Keine Fahrzeuge gefunden."
          filter={(x, q) => !q || `${x.vehicle.licensePlate} ${x.vehicle.name}`.toLowerCase().includes(q)}
          render={(x) => (
            <Action key={x.vehicle.id} onClick={() => setSheet({ kind: "time", date: sheet.date, vehicleId: x.vehicle.id, siteId: site.id })}>
              <span className="rounded border-2 border-ink px-1.5 font-mono text-sm font-bold">{x.vehicle.licensePlate}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{x.vehicle.name}</span>
                <span className="block truncate text-sm font-normal text-muted">{x.info}</span>
              </span>
              <span className="rounded-full bg-slate-200 px-2 text-xs font-bold">
                {x.crew}/{x.vehicle.seats}
              </span>
            </Action>
          )}
        />
      </Dialog>
    );
  }

  // ---------------- Zeitfenster ----------------
  if (sheet.kind === "time") {
    return <TimeDialog key={`${sheet.vehicleId}-${sheet.siteId}-${sheet.assignmentId}`} sheet={sheet} data={data} idx={idx} close={close} run={run} busy={busy} />;
  }
  return null;
}

function TimeDialog({
  sheet,
  data,
  idx,
  close,
  run,
  busy,
}: {
  sheet: Extract<Sheet, { kind: "time" }>;
  data: PlanningData;
  idx: Indexes;
  close: () => void;
  run: Run;
  busy: boolean;
}) {
  const vehicle = idx.vehicles.get(sheet.vehicleId)!;
  const site = idx.sites.get(sheet.siteId)!;
  const vd = data.vehicleDays.find((v) => v.date === sheet.date && v.vehicleId === vehicle.id);
  const current = sheet.assignmentId ? vd?.assignments.find((a) => a.id === sheet.assignmentId) : undefined;
  const others = useMemo(() => (vd?.assignments ?? []).filter((a) => a.id !== sheet.assignmentId), [vd, sheet.assignmentId]);
  const { defaultStartMin: ds, defaultEndMin: de } = data.settings;
  const suggestion = current ? { startMin: current.startMin, endMin: current.endMin } : suggestSlot(others, ds, de);
  const [start, setStart] = useState(suggestion?.startMin ?? ds);
  const [end, setEnd] = useState(suggestion?.endMin ?? de);
  const clash = findOverlap(others, start, end);
  const invalid = end <= start;
  const presets = [
    { label: `Standard ${timeRange(ds, de)}`, s: ds, e: de },
    { label: `Vormittag ${timeRange(ds, 720)}`, s: ds, e: 720 },
    { label: `Nachmittag ${timeRange(720, de)}`, s: 720, e: de },
  ].filter((p) => p.e > p.s);
  const options = gridOptions(0, 24 * 60);

  return (
    <Dialog open onClose={close} title={current ? "Zeit ändern" : "Zeitfenster festlegen"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          close();
          if (current) await run("assignment-update", { id: current.id, version: current.version, startMin: start, endMin: end }, `Zeit auf ${timeRange(start, end)} geändert.`);
          else await run("assignment-create", { date: sheet.date, vehicleId: vehicle.id, siteId: site.id, startMin: start, endMin: end }, `${vehicle.licensePlate} auf „${site.name}“ ${timeRange(start, end)} eingeplant.`);
        }}
      >
        <p>
          <strong>{vehicle.licensePlate}</strong> ({vehicle.name}) auf <strong>{site.name}</strong> · {formatDayShort(sheet.date)}
        </p>
        {!suggestion && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">Für dieses Fahrzeug ist an diesem Tag kein Zeitfenster mehr frei.</p>}
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.label} type="button" onClick={() => { setStart(p.s); setEnd(p.e); }} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${start === p.s && end === p.e ? "border-ink bg-slate-100" : "border-line"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Beginn</span>
            <Select value={start} onChange={(e) => setStart(Number(e.target.value))}>
              {options.slice(0, -1).map((t) => (
                <option key={t} value={t}>
                  {formatMinutes(t)}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Ende</span>
            <Select value={end} onChange={(e) => setEnd(Number(e.target.value))}>
              {options.slice(1).map((t) => (
                <option key={t} value={t}>
                  {formatMinutes(t)}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {others.length > 0 && (
          <div className="text-sm">
            <p className="font-semibold">Weitere Einsätze des Fahrzeugs an diesem Tag:</p>
            <ul className="text-muted">
              {others.map((a) => (
                <li key={a.id}>
                  {timeRange(a.startMin, a.endMin)} · {idx.sites.get(a.siteId)?.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {invalid && <p className="font-semibold text-red-700">Das Ende muss nach dem Beginn liegen.</p>}
        {clash && !invalid && <p className="font-semibold text-red-700">Überschneidet sich mit {timeRange(clash.startMin, clash.endMin)} ({idx.sites.get(clash.siteId)?.name}).</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy || invalid || !!clash}>
            {current ? "Zeit speichern" : "Einplanen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
