"use client";

import { useMemo, useState } from "react";
import { QualificationBadge } from "@/components/qualification-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { api } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { OutageForm, type OutageValue } from "@/components/outage-form";
import { DUE_WARN_DAYS, outageLabel } from "@/lib/constants";
import { diffDays, formatDate, formatRange, todayIso } from "@/lib/dates";
import { AutoDeleteTag, FormActions, ListBox, matches, MessageBar, num, Row, str, Tag, toggleActive, Toolbar, useSave } from "@/components/masterdata/shared";

type Person = { id: string; firstName: string; lastName: string; shortName: string; active: boolean };
type Vehicle = {
  id: string;
  deactivatedAt: Date | string | null;
  kind: string;
  licensePlate: string;
  name: string;
  type: string | null;
  seats: number;
  defaultDriverId: string | null;
  departmentId: string | null;
  department: { id: string; name: string; color: string } | null;
  note: string | null;
  tuevDue: string | null;
  serviceDue: string | null;
  active: boolean;
  sortOrder: number;
  version: number;
  defaultDriver: Person | null;
  defaultMembers: { employee: Person }[];
};
type EmployeeOption = { id: string; firstName: string; lastName: string; shortName: string; qualification: string; department: { id: string; name: string; color: string } };
type DepartmentOption = { id: string; name: string; color: string };

const TYPE_SUGGESTIONS = ["Transporter", "PKW", "LKW", "Pritsche", "Kastenwagen"];

export function VehicleAdmin({
  vehicles: allVehicles,
  employees,
  departments,
  kind = "VEHICLE",
  canDelete = false,
  autoDeleteDays = 0,
  outages = [],
}: {
  vehicles: Vehicle[];
  employees: EmployeeOption[];
  departments: DepartmentOption[];
  /** "VEHICLE" = Fahrzeuge, "ROOM" = Räume */
  kind?: "VEHICLE" | "ROOM";
  /** Endgültig löschen (nur Admin, nur inaktive) */
  canDelete?: boolean;
  autoDeleteDays?: number;
  /** laufende und künftige Ausfälle */
  outages?: OutageValue[];
}) {
  const room = kind === "ROOM";
  const vehicles = allVehicles.filter((v) => (v.kind ?? "VEHICLE") === kind);
  const page = useSave();
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [outageFor, setOutageFor] = useState<{ vehicle: Vehicle; outage: OutageValue | null } | null>(null);
  const router = useRouter();
  const today = todayIso();
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);

  const filtered = useMemo(
    () =>
      vehicles.filter(
        (v) =>
          (showInactive || v.active) &&
          matches(
            query,
            v.licensePlate,
            v.name,
            v.type,
            v.defaultDriver?.lastName,
            v.defaultDriver?.shortName,
            ...v.defaultMembers.map((m) => m.employee.lastName),
          ),
      ),
    [vehicles, query, showInactive],
  );

  return (
    <div className="space-y-4">
      <MessageBar msg={page.msg} />
      <Toolbar
        query={query}
        onQuery={setQuery}
        placeholder={room ? "Name, Kürzel oder Person" : "Kennzeichen, Bezeichnung oder Fahrer"}
        showInactive={showInactive}
        onShowInactive={setShowInactive}
        onCreate={() => setEditing("new")}
        createLabel={room ? "Raum anlegen" : "Fahrzeug anlegen"}
      />
      <ListBox empty={room ? "Noch keine Räume angelegt (z. B. Lager, Schulungsraum)." : "Keine Fahrzeuge gefunden."}>
        {filtered.map((v) => {
          const crew = [v.defaultDriver, ...v.defaultMembers.map((m) => m.employee)].filter(Boolean) as Person[];
          return (
            <Row
              key={v.id}
              inactive={!v.active}
              actions={
                <>
                  <Button variant="secondary" onClick={() => setEditing(v)}>
                    Bearbeiten
                  </Button>
                  {!room && v.active && (
                    <Button variant="secondary" onClick={() => setOutageFor({ vehicle: v, outage: null })} title="Werkstatt, TÜV, Reifenwechsel …">
                      🔧 Ausfall
                    </Button>
                  )}
                  <Button
                    variant={v.active ? "ghost" : "secondary"}
                    disabled={page.busy}
                    onClick={() =>
                      page.run(() => toggleActive(`/api/vehicles/${v.id}`, v.version, !v.active), `${room ? v.name : v.licensePlate} ${v.active ? "deaktiviert" : "aktiviert"}.`)
                    }
                  >
                    {v.active ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                  {canDelete && !v.active && (
                    <Button
                      variant="danger"
                      disabled={page.busy}
                      onClick={() => {
                        const label = room ? `Raum „${v.name}“` : `Fahrzeug ${v.licensePlate} (${v.name})`;
                        if (!confirm(`${label} endgültig löschen?\n\nAlle Einsätze dieses ${room ? "Raums" : "Fahrzeugs"} (auch vergangene Tage, mit Besatzung und Baustellen-Zeiten) werden gelöscht. Das kann nicht rückgängig gemacht werden.`)) return;
                        void page.run(() => api(`/api/vehicles/${v.id}`, { method: "DELETE", body: { version: v.version } }), `${label} wurde endgültig gelöscht.`);
                      }}
                    >
                      Endgültig löschen
                    </Button>
                  )}
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                {room ? (
                  <span className="text-lg" aria-hidden>
                    🏠
                  </span>
                ) : (
                  <span className="rounded border-2 border-ink bg-white px-2 font-mono text-base font-bold tracking-wide">{v.licensePlate}</span>
                )}
                <span className="text-lg font-bold">{v.name}</span>
                {room && <span className="font-mono text-sm text-muted">{v.licensePlate}</span>}
                {v.type && <span className="text-muted">{v.type}</span>}
                <Tag>
                  {v.seats} {room ? "Plätze" : "Sitze"}
                </Tag>
                {(() => {
                  const dep = v.department ?? employees.find((e) => e.id === v.defaultDriverId)?.department;
                  return dep ? (
                    <span className="inline-flex items-center gap-1 text-sm text-muted" title={v.department ? "Abteilung des Fahrzeugs" : "Abteilung des Besitzers"}>
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: dep.color }} aria-hidden />
                      {dep.name}
                      {!v.department && " (über Besitzer)"}
                    </span>
                  ) : null;
                })()}
                {!room && <DueTag label="TÜV" date={v.tuevDue} today={today} />}
                {!room && <DueTag label="Service" date={v.serviceDue} today={today} />}
                {!v.active && <Tag>inaktiv</Tag>}
                {!v.active && <AutoDeleteTag deactivatedAt={v.deactivatedAt} days={autoDeleteDays} />}
              </div>
              <div className="mt-1 text-sm text-muted">
                {crew.length === 0 ? (
                  room ? "keine Standard-Personen" : "keine Standard-Besatzung"
                ) : (
                  <>
                    Standard:{" "}
                    {crew.map((p, i) => (
                      <span key={p.id} className={p.active ? "" : "line-through"}>
                        {i > 0 && ", "}
                        {p.firstName} {p.lastName}
                        {i === 0 && v.defaultDriver ? " (Fahrer)" : ""}
                      </span>
                    ))}
                  </>
                )}
                {v.note && <span className="block italic">{v.note}</span>}
              </div>
              {outages
                .filter((o) => o.vehicleId === v.id)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setOutageFor({ vehicle: v, outage: o })}
                    className={`mt-1 block rounded-md px-2 py-1 text-left text-sm font-semibold hover:ring-2 hover:ring-brand-600 ${o.startDate <= today ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
                    title="Ausfall bearbeiten oder löschen"
                  >
                    🔧 {outageLabel(o.reason)} {formatRange(o.startDate, o.endDate)}
                    {o.startDate <= today ? " – aktuell nicht verfügbar" : ""}
                    {o.note ? ` · ${o.note}` : ""}
                  </button>
                ))}
            </Row>
          );
        })}
      </ListBox>

      <Dialog open={outageFor !== null} onClose={() => setOutageFor(null)} title={outageFor?.outage ? "🔧 Ausfall bearbeiten" : "🔧 Ausfall eintragen"}>
        {outageFor && (
          <OutageForm
            key={outageFor.outage?.id ?? outageFor.vehicle.id}
            vehicle={outageFor.vehicle}
            outage={outageFor.outage}
            defaultStart={today}
            onCancel={() => setOutageFor(null)}
            onDone={(text) => {
              setOutageFor(null);
              page.setMsg({ tone: "success", text });
              router.refresh();
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? (room ? "Raum anlegen" : "Fahrzeug anlegen") : room ? "Raum bearbeiten" : "Fahrzeug bearbeiten"}
      >
        {editing !== null && (
          <VehicleForm
            key={editing === "new" ? "new" : editing.id}
            vehicle={editing === "new" ? null : editing}
            vehicles={vehicles}
            employees={employees}
            departments={departments}
            room={room}
            onDone={(text) => {
              setEditing(null);
              page.setMsg({ tone: "success", text });
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function VehicleForm({
  vehicle,
  vehicles,
  employees,
  departments,
  room,
  onDone,
  onCancel,
}: {
  vehicle: Vehicle | null;
  vehicles: Vehicle[];
  employees: EmployeeOption[];
  departments: DepartmentOption[];
  room: boolean;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const form = useSave();
  const [seats, setSeats] = useState(vehicle?.seats ?? (room ? 10 : 3));
  const [driverId, setDriverId] = useState(vehicle?.defaultDriverId ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(vehicle?.defaultMembers.map((m) => m.employee.id) ?? []);
  const [memberQuery, setMemberQuery] = useState("");

  // Wer ist bereits auf einem anderen Fahrzeug Standard?
  const otherDefaults = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehicles) {
      if (v.id === vehicle?.id || !v.active) continue;
      if (v.defaultDriverId) map.set(v.defaultDriverId, v.licensePlate);
      for (const m of v.defaultMembers) map.set(m.employee.id, v.licensePlate);
    }
    return map;
  }, [vehicles, vehicle]);

  const crewCount = (driverId ? 1 : 0) + memberIds.length;
  const overSeats = crewCount > seats;
  const name = (e: EmployeeOption) => `${e.lastName}, ${e.firstName} (${e.shortName})`;
  const memberOptions = employees.filter((e) => e.id !== driverId && matches(memberQuery, e.firstName, e.lastName, e.shortName));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          kind: room ? "ROOM" : "VEHICLE",
          licensePlate: str(f, "licensePlate"),
          name: str(f, "name"),
          type: str(f, "type") || null,
          seats,
          defaultDriverId: room ? null : driverId || null,
          defaultMemberIds: memberIds.filter((id) => id !== driverId),
          departmentId: str(f, "departmentId") || null,
          note: str(f, "note") || null,
          ...(room ? {} : { tuevDue: str(f, "tuevDue") || null, serviceDue: str(f, "serviceDue") || null }),
          sortOrder: num(f, "sortOrder"),
        };
        const ok = await form.run(
          () =>
            vehicle
              ? api(`/api/vehicles/${vehicle.id}`, { method: "PATCH", body: { ...body, version: vehicle.version } })
              : api("/api/vehicles", { body }),
          "",
        );
        if (ok) onDone(room ? `Raum „${body.name}“ gespeichert.` : `Fahrzeug ${body.licensePlate.toUpperCase()} gespeichert.`);
      }}
    >
      {form.msg?.tone === "error" && <MessageBar msg={form.msg} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={room ? "Kürzel" : "Kennzeichen"} hint={room ? "kurz, eindeutig, z. B. LAGER" : undefined}>
          <Input name="licensePlate" defaultValue={vehicle?.licensePlate} required maxLength={15} className="font-mono uppercase" autoFocus placeholder={room ? "LAGER" : "WÜ-AB 123"} />
        </Field>
        <Field label={room ? "Name" : "Bezeichnung"}>
          <Input name="name" defaultValue={vehicle?.name} required maxLength={60} placeholder={room ? "Lager" : "Sprinter 1"} />
        </Field>
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        {room ? (
          <input type="hidden" name="type" value="" />
        ) : (
        <Field label="Typ (optional)">
          <Input name="type" defaultValue={vehicle?.type ?? ""} list="vehicle-types" maxLength={40} />
          <datalist id="vehicle-types">
            {TYPE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        )}
        <Field label={room ? "Plätze" : "Sitzplätze"}>
          <Select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {(room ? [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50] : [1, 2, 3, 4, 5, 6, 7, 8, 9]).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!room && (
      <Field label="Standard-Fahrer („Besitzer“)" hint={driverId && otherDefaults.has(driverId) ? `Ist auch Standard auf ${otherDefaults.get(driverId)}` : undefined}>
        <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">– keiner –</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {name(e)}
            </option>
          ))}
        </Select>
      </Field>
      )}

      <Field
        label="Abteilung"
        hint={`Für das Ausblenden in der Planung. Leer = Abteilung des Besitzers${driverId ? ` (${employees.find((e) => e.id === driverId)?.department.name ?? "–"})` : ""}.`}
      >
        <Select name="departmentId" defaultValue={vehicle?.departmentId ?? ""}>
          <option value="">– wie Besitzer –</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset>
        <legend className="mb-1 flex w-full items-center justify-between text-sm font-semibold">
          <span>{room ? "Standard-Personen (z. B. Lagerist)" : "Weitere Standard-Mitfahrer"}</span>
          <span className={overSeats ? "font-bold text-red-700" : "text-muted"}>
            {room ? "Personen" : "Besatzung"} {crewCount}/{seats}
            {overSeats && " – zu viele!"}
          </span>
        </legend>
        <Input type="search" placeholder="Mitarbeiter suchen" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />
        <ul className="mt-2 max-h-52 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {memberOptions.map((e) => (
            <li key={e.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="size-5 accent-brand-600"
                  checked={memberIds.includes(e.id)}
                  onChange={(ev) => setMemberIds((ids) => (ev.target.checked ? [...ids, e.id] : ids.filter((x) => x !== e.id)))}
                />
                <span className="h-5 w-1 rounded-full" style={{ backgroundColor: e.department.color }} aria-hidden />
                <span className="flex-1">{name(e)}</span>
                <QualificationBadge q={e.qualification} />
                {otherDefaults.has(e.id) && <span className="text-xs text-muted">auch {otherDefaults.get(e.id)}</span>}
              </label>
            </li>
          ))}
          {memberOptions.length === 0 && <li className="p-3 text-center text-muted">Keine Treffer</li>}
        </ul>
      </fieldset>

      {!room && (
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="TÜV fällig (optional)">
            <Input name="tuevDue" type="date" defaultValue={vehicle?.tuevDue ?? ""} />
          </Field>
          <Field label="Service fällig (optional)">
            <Input name="serviceDue" type="date" defaultValue={vehicle?.serviceDue ?? ""} />
          </Field>
        </div>
      )}
      <Field label="Notiz (optional)">
        <textarea name="note" defaultValue={vehicle?.note ?? ""} maxLength={500} rows={2} className="block w-full rounded-lg border border-line px-3 py-2 text-base" />
      </Field>
      <Field label="Reihenfolge" hint="Kleinere Zahlen stehen in Listen weiter oben.">
        <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={vehicle?.sortOrder ?? 0} />
      </Field>
      <FormActions busy={form.busy || overSeats} onCancel={onCancel} />
    </form>
  );
}

/** TÜV/Service-Fälligkeit: rot = überfällig, gelb = in den nächsten 30 Tagen */
function DueTag({ label, date, today }: { label: string; date: string | null; today: string }) {
  if (!date) return null;
  const days = diffDays(today, date);
  const tone = days < 0 ? "red" : days <= DUE_WARN_DAYS ? "amber" : "slate";
  return (
    <Tag tone={tone}>
      {label} {days < 0 ? "überfällig seit" : "fällig"} {formatDate(date)}
    </Tag>
  );
}
