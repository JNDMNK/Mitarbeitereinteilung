"use client";

import { QualificationBadge } from "@/components/qualification-badge";
import type { Warning } from "@/lib/planning-logic";
import type { PAbsenceType, PDepartment, PEmployee, PVehicle } from "@/lib/planning-types";

export function EmployeeChip({
  employee,
  department,
  absenceType,
  own,
  onClick,
}: {
  employee: PEmployee;
  department?: PDepartment;
  absenceType?: PAbsenceType;
  own?: boolean;
  onClick?: () => void;
}) {
  const absent = !!absenceType;
  const body = (
    <>
      <span className="truncate">
        {employee.firstName} {employee.lastName}
      </span>
      <span className="font-mono text-[11px] font-semibold text-muted">{employee.shortName}</span>
      <QualificationBadge q={employee.qualification} />
      {absenceType && (
        <span className="rounded px-1 font-mono text-[11px] leading-5 font-bold text-white" style={{ backgroundColor: absenceType.color }} title={absenceType.name}>
          {absenceType.code}
        </span>
      )}
    </>
  );
  const cls = `inline-flex max-w-full min-h-9 items-center gap-1.5 rounded-md border-l-4 px-2 py-1 text-sm shadow-sm ring-1 ${
    own ? "bg-brand-50 font-bold ring-2 ring-brand-600" : absent ? "bg-slate-100 text-slate-500 ring-line" : "bg-white ring-line"
  } ${onClick ? "cursor-pointer hover:ring-2 hover:ring-brand-600 active:bg-slate-50" : ""}`;
  const style = { borderLeftColor: department?.color ?? "#94a3b8" };
  const title = `${employee.firstName} ${employee.lastName}${absenceType ? ` – ${absenceType.name}` : ""}${own ? " (Sie)" : ""}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} style={style} title={title}>
      {body}
    </button>
  ) : (
    <span className={cls} style={style} title={title}>
      {body}
    </span>
  );
}

export function VehicleLabel({ vehicle, crewCount, onClick }: { vehicle: PVehicle; crewCount: number; onClick?: () => void }) {
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
  const cls = "flex w-full min-h-9 items-center gap-2 rounded-md text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} -mx-1 px-1 hover:bg-slate-100`}>
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
