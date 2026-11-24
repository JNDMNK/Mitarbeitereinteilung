"use client";

import type { HTMLAttributes, Ref } from "react";
import { QualificationBadge } from "@/components/qualification-badge";
import type { Warning } from "@/lib/planning-logic";
import type { PAbsenceType, PDepartment, PEmployee, PVehicle } from "@/lib/planning-types";
import type { AbsentEntry, OwnerInfo } from "@/lib/planning-view";

export function EmployeeChip({
  employee,
  department,
  absenceType,
  own,
  onClick,
  dragRef,
  dragProps,
  dragging,
  assignedBy,
  label,
  isOwner,
}: {
  employee: PEmployee;
  /** fährt sein eigenes Fahrzeug (Besitzer) */
  isOwner?: boolean;
  /** kompakter Anzeigename, z. B. "Müller M." */
  label?: string;
  /** z. B. "ESC (Erik Schmidt), 23.11. 14:05" */
  assignedBy?: string;
  department?: PDepartment;
  absenceType?: PAbsenceType;
  own?: boolean;
  onClick?: () => void;
  dragRef?: Ref<HTMLButtonElement>;
  dragProps?: HTMLAttributes<HTMLElement>;
  dragging?: boolean;
}) {
  const absent = !!absenceType;
  const body = (
    <>
      {isOwner && (
        <span aria-label="Besitzer des Fahrzeugs" className="text-xs">
          👤
        </span>
      )}
      <span className="truncate">{label ?? `${employee.lastName} ${employee.firstName.slice(0, 1)}.`}</span>
      <QualificationBadge q={employee.qualification} />
      {absenceType && (
        <span className="rounded px-1 font-mono text-[11px] leading-5 font-bold text-white" style={{ backgroundColor: absenceType.color }} title={absenceType.name}>
          {absenceType.code}
        </span>
      )}
    </>
  );
  const cls = `inline-flex max-w-full min-h-11 md:min-h-7 items-center gap-1 rounded-md border-l-4 px-1.5 py-0.5 text-sm shadow-sm ring-1 ${
    own ? "bg-brand-50 font-bold ring-2 ring-brand-600" : absent ? "bg-slate-100 text-slate-500 ring-line" : "bg-white ring-line"
  } ${onClick ? "cursor-pointer hover:ring-2 hover:ring-brand-600 active:bg-slate-50" : ""} ${dragProps && Object.keys(dragProps).length ? "touch-manipulation select-none [-webkit-touch-callout:none]" : ""} ${dragging ? "opacity-30" : ""}`;
  const style = { borderLeftColor: department?.color ?? "#94a3b8" };
  const title = `${employee.firstName} ${employee.lastName} (${employee.shortName})${isOwner ? " – Besitzer des Fahrzeugs" : ""}${absenceType ? ` – ${absenceType.name}` : ""}${own ? " (Sie)" : ""}${assignedBy ? `\neingeteilt von ${assignedBy}` : ""}`;
  return onClick ? (
    <button type="button" ref={dragRef} {...dragProps} onClick={onClick} className={cls} style={style} title={title}>
      {body}
    </button>
  ) : (
    <span className={cls} style={style} title={title}>
      {body}
    </span>
  );
}

export function VehicleLabel({
  vehicle,
  crewCount,
  onClick,
  dragRef,
  dragProps,
  dragging,
}: {
  vehicle: PVehicle;
  crewCount: number;
  onClick?: () => void;
  dragRef?: Ref<HTMLButtonElement>;
  dragProps?: HTMLAttributes<HTMLElement>;
  dragging?: boolean;
}) {
  const over = crewCount > vehicle.seats;
  const body = (
    <>
      <span className="rounded border-2 border-ink bg-white px-1.5 font-mono text-sm leading-5 font-bold tracking-wide whitespace-nowrap">{vehicle.licensePlate}</span>
      <span className="truncate font-semibold">{vehicle.name}</span>
      <span className={`ml-auto shrink-0 rounded-full px-2 text-xs leading-5 font-bold ${over ? "bg-red-600 text-white" : "bg-slate-200 text-slate-800"}`} title="Besatzung / Sitzplätze">
        {crewCount}/{vehicle.seats}
      </span>
    </>
  );
  const cls = "flex w-full min-h-11 md:min-h-9 items-center gap-2 rounded-md text-left";
  return onClick ? (
    <button
      type="button"
      ref={dragRef}
      {...dragProps}
      onClick={onClick}
      title={dragProps && Object.keys(dragProps).length ? "Antippen für Aktionen, ziehen zum Verschieben (Strg/Alt = kopieren)" : undefined}
      className={`${cls} -mx-1 px-1 hover:bg-slate-100 ${dragProps && Object.keys(dragProps).length ? "cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]" : ""} ${dragging ? "opacity-30" : ""}`}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function WarningList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {warnings.map((w) => (
        <li key={w.text} className={`flex items-start gap-1 text-xs font-semibold ${w.level === "error" ? "text-red-700" : "text-amber-800"}`}>
          <span aria-hidden>⚠</span>
          {w.text}
        </li>
      ))}
    </ul>
  );
}

/** Kleines Kürzel „wer hat geplant“ */
export function ByBadge({ initials, title }: { initials: string; title: string }) {
  return (
    <span className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[11px] leading-5 font-bold text-slate-700 ring-1 ring-slate-300" title={title}>
      ✎ {initials}
    </span>
  );
}

/** "👤 Max Müller · heute auf WÜ-EL 102" – Besitzer laut Stammdaten mit Tagesstatus */
export function OwnerLine({
  owner,
  ownEmployeeId,
  name,
  extra,
}: {
  owner?: OwnerInfo;
  ownEmployeeId?: string | null;
  name?: string;
  /** z. B. Standard-Mitfahrer in derselben Zeile */
  extra?: string;
}) {
  if (!owner) return null;
  const e = owner.employee;
  const status =
    owner.state === "here"
      ? null
      : owner.state === "elsewhere"
        ? { text: `heute auf ${owner.elsewhereVehicle?.licensePlate ?? "anderem Fahrzeug"}`, cls: "text-amber-800" }
        : owner.state === "absent"
          ? { text: `abwesend (${owner.absence?.type?.code ?? "?"})`, cls: "text-red-700" }
          : { text: "nicht eingeteilt", cls: "text-muted" };
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs" title={`Besitzer / Standard-Fahrer laut Stammdaten: ${e.firstName} ${e.lastName}`}>
      <span aria-hidden>👤</span>
      <span className={`font-semibold ${e.id === ownEmployeeId ? "text-brand-700" : "text-slate-700"}`}>{name ?? `${e.lastName} ${e.firstName.slice(0, 1)}.`}</span>
      {status && <span className={`font-semibold ${status.cls}`}>· {status.text}</span>}
      {extra && <span className="text-muted">· {extra}</span>}
    </p>
  );
}

/** Hinweis bei gesperrtem Fahrzeug */
export function UnavailableNote({ entry }: { entry: AbsentEntry }) {
  return (
    <p className="text-xs font-bold text-red-700">
      🚫 nicht verfügbar – mit {entry.employee.firstName} {entry.employee.lastName} abwesend ({entry.type?.name ?? "Abwesenheit"})
    </p>
  );
}
