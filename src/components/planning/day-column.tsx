"use client";

import { groupByQualification } from "@/lib/constants";
import { QualificationBadge } from "@/components/qualification-badge";
import type { ReactNode } from "react";
import { formatDayLong, formatDayShort, isWeekend, isoWeek, mapsUrl } from "@/lib/dates";
import { holidayName } from "@/lib/holidays";
import { timeRange } from "@/lib/planning-logic";
import type { PEmployee, PVehicle } from "@/lib/planning-types";
import type { DayView, Indexes, VehicleSlot } from "@/lib/planning-view";
import { formatDateTimeShort } from "@/lib/dates";
import { ByBadge, EmployeeChip, OwnerLine, UnavailableNote, VehicleLabel, WarningList, DueBadges } from "./chips";
import { dropZoneClass, useDragItem, useDropZone, type DragData, type DropData } from "./dnd";
import type { Sheet } from "./sheets";

type Props = {
  day: DayView;
  idx: Indexes;
  today: string;
  canEdit: boolean;
  ownEmployeeId: string | null;
  open: (s: Sheet) => void;
  /** freie Mitarbeiter stehen in der Seitenleiste (breite Bildschirme) */
  poolInSidebar?: boolean;
};

export function DraggableEmployee({
  employee,
  date,
  fromVehicleId,
  day,
  idx,
  canEdit,
  own,
  open,
  suffix,
  assignedBy,
  isOwner,
  fullWidth,
}: {
  employee: PEmployee;
  date: string;
  fullWidth?: boolean;
  fromVehicleId: string | null;
  assignedBy?: string;
  isOwner?: boolean;
  day: DayView;
  idx: Indexes;
  canEdit: boolean;
  own: boolean;
  open: (s: Sheet) => void;
  /** eindeutiger Zusatz, falls der Mitarbeiter mehrfach angezeigt wird (mehrere Einsätze) */
  suffix: string;
}) {
  const abs = day.absent.find((a) => a.employee.id === employee.id);
  const data: DragData = { type: "employee", date, employeeId: employee.id, fromVehicleId };
  // Abwesende im Pool lassen sich nicht einteilen; eingeteilte Abwesende nur zurück in den Pool ziehen
  const drag = useDragItem(`emp:${date}:${employee.id}:${suffix}`, data, !canEdit || !employee.active || (!!abs && !fromVehicleId));
  return (
    <EmployeeChip
      employee={employee}
      department={idx.departments.get(employee.departmentId)}
      absenceType={abs?.type}
      own={own}
      onClick={() => open({ kind: "employee", date, employeeId: employee.id })}
      dragRef={drag.ref}
      dragProps={drag.props}
      dragging={drag.isDragging}
      assignedBy={assignedBy}
      label={fullWidth ? `${employee.lastName}, ${employee.firstName}` : idx.names.get(employee.id)}
      isOwner={isOwner}
      fullWidth={fullWidth}
    />
  );
}

/** "ESC (Erik Schmidt), 23.11. 14:05" */
export function plannerText(idx: Indexes, userId: string | null | undefined, at?: string): string | undefined {
  if (!userId) return undefined;
  const p = idx.planners.get(userId);
  if (!p) return undefined;
  return `${p.initials} (${p.name})${at ? `, ${formatDateTimeShort(at)}` : ""}`;
}

function DraggableVehicle({
  slot,
  date,
  assignment,
  siteId,
  canEdit,
  onClick,
  suffix,
}: {
  slot: VehicleSlot;
  date: string;
  assignment: { id: string; version: number; startMin: number; endMin: number } | null;
  siteId: string | null;
  canEdit: boolean;
  onClick: () => void;
  suffix: string;
}) {
  const data: DragData = {
    type: "vehicle",
    date,
    vehicleId: slot.vehicle.id,
    assignmentId: assignment?.id ?? null,
    assignmentVersion: assignment?.version ?? null,
    siteId,
    startMin: assignment?.startMin ?? null,
    endMin: assignment?.endMin ?? null,
    vdVersion: slot.vehicleDay?.version ?? null,
  };
  // Räume werden nicht gezogen (kommen nie auf eine Baustelle)
  const drag = useDragItem(`veh:${date}:${slot.vehicle.id}:${suffix}`, data, !canEdit || !slot.vehicle.active || !!slot.unavailable || slot.vehicle.kind === "ROOM");
  return <VehicleLabel vehicle={slot.vehicle} crewCount={slot.crew.length} onClick={onClick} dragRef={drag.ref} dragProps={drag.props} dragging={drag.isDragging} />;
}

export function Drop({
  id,
  data,
  canEdit,
  className,
  children,
  as = "div",
  disabled = false,
}: {
  id: string;
  data: DropData;
  canEdit: boolean;
  className: string;
  children: ReactNode;
  as?: "div" | "li" | "article";
  disabled?: boolean;
}) {
  const { ref, isOver, canDrop } = useDropZone(id, data, !canEdit || disabled);
  const Tag = as;
  return (
    <Tag ref={ref as never} className={`${className} transition-shadow ${dropZoneClass({ isOver, canDrop })}`}>
      {children}
    </Tag>
  );
}

export function DayColumn({ day, idx, today, canEdit, ownEmployeeId, open, poolInSidebar = false }: Props) {
  const ownerHighlight = ownEmployeeId;
  const crewChips = (crew: PEmployee[], vehicle: PVehicle, suffix: string, slot?: VehicleSlot) =>
    crew.map((e) => (
      <DraggableEmployee
        key={e.id}
        employee={e}
        date={day.date}
        fromVehicleId={vehicle.id}
        isOwner={vehicle.ownerId === e.id}
        assignedBy={(() => {
          const row = slot?.vehicleDay?.crew.find((c) => c.employeeId === e.id);
          return plannerText(idx, row?.assignedById, row?.createdAt);
        })()}
        day={day}
        idx={idx}
        canEdit={canEdit}
        own={e.id === ownEmployeeId}
        open={open}
        suffix={suffix}
      />
    ));

  return (
    <section className="min-w-0 space-y-3" aria-label={`${formatDayLong(day.date)}, KW ${isoWeek(day.date)}`}>
      <DayHeader day={day} today={today} canEdit={canEdit} open={open} />
      <AbsentBar day={day} ownEmployeeId={ownEmployeeId} open={open} idx={idx} />

      {/* Baustellen */}
      {day.sites.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-line bg-white/60 p-4 text-center text-sm text-muted">
          Noch keine Baustellen eingeplant.{canEdit && " Fahrzeug aus dem Pool auf eine Baustelle ziehen oder „+ Baustelle“."}
        </div>
      )}
      {day.sites.map((g) => (
        <Drop
          key={g.site.id}
          as="article"
          id={`site:${day.date}:${g.site.id}`}
          data={{ kind: "site", accepts: "vehicle", date: day.date, siteId: g.site.id }}
          canEdit={canEdit}
          className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line"
        >
          <div className="flex items-start gap-2 border-b border-line px-3 py-1.5" style={{ boxShadow: `inset 6px 0 0 ${g.site.color}` }}>
            <div className="min-w-0 flex-1 pl-1.5">
              <h3 className="leading-tight font-bold">
                {g.site.name}
                {g.site.orderNumber && <span className="ml-1.5 font-mono text-xs font-semibold text-muted">Projekt-Nr. {g.site.orderNumber}</span>}
              </h3>
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
          <ul className="divide-y divide-line" style={{ boxShadow: `inset 6px 0 0 ${g.site.color}` }}>
            {g.items.map((it) => (
              <Drop
                key={it.assignment.id}
                as="li"
                id={`vehdrop:${day.date}:${it.vehicle.id}:${it.assignment.id}`}
                data={{ kind: "vehicle", accepts: "employee", date: day.date, vehicleId: it.vehicle.id }}
                canEdit={canEdit}
                className="space-y-1 py-1.5 pr-2 pl-4"
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-slate-800 px-1.5 font-mono text-xs leading-6 font-bold text-white">
                    {timeRange(it.assignment.startMin, it.assignment.endMin)}
                  </span>
                  {it.assignment.updatedById && idx.planners.get(it.assignment.updatedById) && (
                    <ByBadge
                      initials={idx.planners.get(it.assignment.updatedById)!.initials}
                      title={`Zuletzt geplant von ${plannerText(idx, it.assignment.updatedById, it.assignment.updatedAt)}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <DraggableVehicle
                      slot={it}
                      date={day.date}
                      assignment={it.assignment}
                      siteId={g.site.id}
                      canEdit={canEdit}
                      suffix={it.assignment.id}
                      onClick={() => open({ kind: "vehicle", date: day.date, vehicleId: it.vehicle.id, assignmentId: it.assignment.id })}
                    />
                  </div>
                </div>
                {it.due && (
                  <div className="flex flex-wrap gap-1">
                    <DueBadges due={it.due} />
                  </div>
                )}
                {it.owner && it.owner.state !== "here" && <OwnerLine owner={it.owner} ownEmployeeId={ownerHighlight} name={idx.names.get(it.owner.employee.id)} />}
                {it.crew.length > 0 ? (
                  <div className="flex flex-wrap gap-1">{crewChips(it.crew, it.vehicle, it.assignment.id, it)}</div>
                ) : (
                  canEdit && <p className="text-xs text-muted">Mitarbeiter hierher ziehen</p>
                )}
                {it.assignment.note && <p className="text-xs text-muted italic">{it.assignment.note}</p>}
                <WarningList warnings={it.crewWarnings} />
              </Drop>
            ))}
          </ul>
        </Drop>
      ))}

      {/* Pool */}
      <Drop
        id={`pool:${day.date}`}
        data={{ kind: "pool", accepts: "both", date: day.date }}
        canEdit={canEdit}
        className="rounded-xl bg-slate-50 p-2 ring-1 ring-line"
      >
        <h3 className="mb-2 text-sm font-bold">{poolInSidebar ? "Fahrzeuge ohne Baustelle" : "Nicht eingeteilt"}</h3>
        {poolInSidebar ? null : (
        <div className="mb-3">
          <h4 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Mitarbeiter ({day.poolEmployees.length} verfügbar)</h4>
          {day.poolEmployees.length === 0 ? (
            <p className="text-sm text-muted">Alle eingeteilt.</p>
          ) : (
            <div className="space-y-1.5">
              {groupByQualification(day.poolEmployees, (p) => p.employee.qualification).map((g) => (
                <div key={g.q}>
                  <div className="mb-0.5 text-[11px] font-semibold text-muted">
                    {g.label} ({g.items.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
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
                        suffix="pool"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        <div>
          {!poolInSidebar && <h4 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Fahrzeuge ohne Baustelle ({day.poolVehicles.length})</h4>}
          <div className="space-y-1.5">
            {day.poolVehicles.map((p) => (
              <Drop
                key={p.vehicle.id}
                id={`vehdrop:${day.date}:${p.vehicle.id}:pool`}
                data={{ kind: "vehicle", accepts: "employee", date: day.date, vehicleId: p.vehicle.id }}
                canEdit={canEdit}
                disabled={!!p.unavailable}
                className={`rounded-lg px-2 py-1 ring-1 ring-line ${p.unavailable ? "bg-slate-100 opacity-80" : "bg-white"}`}
              >
                <DraggableVehicle slot={p} date={day.date} assignment={null} siteId={null} canEdit={canEdit} suffix="pool" onClick={() => open({ kind: "vehicle", date: day.date, vehicleId: p.vehicle.id })} />
                {p.due && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <DueBadges due={p.due} />
                  </div>
                )}
                {p.unavailable ? (
                  <UnavailableNote entry={p.unavailable} />
                ) : (
                  <>
                    {p.owner && p.owner.state !== "here" && (
                      <OwnerLine
                        owner={p.owner}
                        ownEmployeeId={ownerHighlight}
                        name={idx.names.get(p.owner.employee.id)}
                        extra={p.crew.length === 0 && p.defaultMembers.length > 0 ? `+ ${p.defaultMembers.map((e) => idx.names.get(e.id) ?? e.shortName).join(", ")}` : undefined}
                      />
                    )}
                    {!p.owner && p.crew.length === 0 && p.defaultMembers.length > 0 && (
                      <p className="text-xs text-muted">Standard: {p.defaultMembers.map((e) => idx.names.get(e.id) ?? e.shortName).join(", ")}</p>
                    )}
                  </>
                )}
                {p.crew.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{crewChips(p.crew, p.vehicle, "pool", p)}</div>}
                <WarningList warnings={p.crewWarnings} />
              </Drop>
            ))}
          </div>
        </div>
      </Drop>

      <RoomsBox day={day} idx={idx} canEdit={canEdit} ownEmployeeId={ownEmployeeId} open={open} />
    </section>
  );
}

export function DayHeader({ day, today, canEdit, open, sticky = true }: { day: DayView; today: string; canEdit: boolean; open: (s: Sheet) => void; sticky?: boolean }) {
  const isToday = day.date === today;
  const holiday = holidayName(day.date);
  return (
      <header
        className={`${sticky ? "md:sticky md:top-14 md:z-20" : ""} flex items-center justify-between gap-2 rounded-xl px-3 py-2 shadow-sm ${
          isToday ? "bg-brand-700 text-white" : isWeekend(day.date) || holiday ? "bg-slate-300 text-ink" : "bg-ink text-white"
        }`}
      >
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-bold">
            {formatDayShort(day.date)} <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 align-middle text-xs font-semibold">KW {isoWeek(day.date)}</span>
          </h2>
          <p className="truncate text-xs opacity-90">
            {isToday ? "Heute · " : ""}
            {holiday ? <strong>🎉 {holiday} · </strong> : null}
            {day.stats.assigned} eingeteilt · {day.stats.available} frei · {day.stats.absent} abwesend
          </p>
        </div>
        <div className="no-print flex shrink-0 gap-1">
          <a
            href={`/druck?datum=${day.date}`}
            target="_blank"
            rel="noopener"
            className="flex min-h-10 items-center rounded-lg bg-white/15 px-2 text-sm font-semibold hover:bg-white/25"
            title="Druckansicht dieses Tages"
          >
            🖨
          </a>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => open({ kind: "copyDay", date: day.date })}
              className="min-h-10 rounded-lg bg-white/15 px-2 text-sm font-semibold hover:bg-white/25"
              title="Einteilung dieses Tages auf einen anderen Tag übernehmen"
              aria-label="Tag übernehmen"
            >
              ⧉<span className="hidden sm:inline"> Tag</span>
            </button>
            <button type="button" onClick={() => open({ kind: "pickSiteForDay", date: day.date })} className="min-h-10 rounded-lg bg-white/15 px-2 text-sm font-semibold hover:bg-white/25">
              + Baustelle
            </button>
          </>
        )}
        </div>
      </header>
  );
}

export function AbsentBar({ day, ownEmployeeId, open, idx }: { day: DayView; ownEmployeeId: string | null; open: (s: Sheet) => void; idx?: Indexes }) {
  if (day.absent.length === 0) return null;
  return (
<div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-line">
          <h3 className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Abwesend ({day.absent.length})</h3>
          <div className="flex flex-wrap gap-1">
            {day.absent.map((a) => (
              <button
                key={a.employee.id}
                type="button"
                onClick={() => open({ kind: "employee", date: day.date, employeeId: a.employee.id })}
                title={`${a.employee.firstName} ${a.employee.lastName}: ${a.type?.name}`}
                className={`inline-flex min-h-10 md:min-h-8 items-center gap-1 rounded-md px-2 text-sm md:px-1.5 md:text-xs font-semibold ring-1 ring-line ${a.employee.id === ownEmployeeId ? "bg-brand-50 ring-2 ring-brand-600" : "bg-slate-50"}`}
              >
                <span className="rounded px-1 font-mono leading-5 font-bold text-white" style={{ backgroundColor: a.type?.color }}>
                  {a.type?.code}
                </span>
                {idx?.names.get(a.employee.id) ?? a.employee.shortName}
                <QualificationBadge q={a.employee.qualification} />
              </button>
            ))}
          </div>
        </div>
  );
}

/** Räume eines Tages (Lager, Schulungsraum …): Mitarbeiter hineinziehen oder antippen */
export function RoomsBox({ day, idx, canEdit, ownEmployeeId, open }: { day: DayView; idx: Indexes; canEdit: boolean; ownEmployeeId: string | null; open: (s: Sheet) => void }) {
  if (day.rooms.length === 0) return null;
  return (
    <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-line">
      <h3 className="mb-1.5 text-sm font-bold">Räume</h3>
      <div className="space-y-1.5">
        {day.rooms.map((r) => (
          <Drop
            key={r.vehicle.id}
            id={`roomdrop:${day.date}:${r.vehicle.id}`}
            data={{ kind: "vehicle", accepts: "employee", date: day.date, vehicleId: r.vehicle.id }}
            canEdit={canEdit}
            className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-line"
          >
            <VehicleLabel vehicle={r.vehicle} crewCount={r.crew.length} onClick={() => open({ kind: "vehicle", date: day.date, vehicleId: r.vehicle.id })} />
            {r.crew.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {r.crew.map((e) => (
                  <DraggableEmployee
                    key={e.id}
                    employee={e}
                    date={day.date}
                    fromVehicleId={r.vehicle.id}
                    day={day}
                    idx={idx}
                    canEdit={canEdit}
                    own={e.id === ownEmployeeId}
                    open={open}
                    suffix={`room-${r.vehicle.id}`}
                    assignedBy={(() => {
                      const row = r.vehicleDay?.crew.find((c) => c.employeeId === e.id);
                      return plannerText(idx, row?.assignedById, row?.createdAt);
                    })()}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">
                {canEdit ? "Mitarbeiter hierher ziehen" : "niemand"}
                {r.defaultMembers.length > 0 && ` · Standard: ${r.defaultMembers.map((e) => idx.names.get(e.id) ?? e.shortName).join(", ")}`}
              </p>
            )}
            <WarningList warnings={r.crewWarnings} />
          </Drop>
        ))}
      </div>
    </div>
  );
}
