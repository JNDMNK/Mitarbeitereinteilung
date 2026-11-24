import "server-only";
import { addDays, eachDay, isWeekend } from "@/lib/dates";
import { db } from "../db";

export type MyDay = {
  date: string;
  absence: { type: { name: string; code: string; color: string }; startDate: string; endDate: string; note: string | null; withVehicle: boolean } | null;
  /** owner = Besitzer, wenn es nicht das eigene Fahrzeug ist */
  vehicle: { licensePlate: string; name: string; type: string | null; isDefaultDriver: boolean; owner: string | null } | null;
  colleagues: { id: string; firstName: string; lastName: string; shortName: string; qualification: string; phone: string | null; isDriver: boolean; absent: boolean }[];
  sites: {
    id: string;
    name: string;
    address: string | null;
    customer: string | null;
    orderNumber: string | null;
    note: string | null;
    color: string;
    startMin: number;
    endMin: number;
    assignmentNote: string | null;
  }[];
};

/** Persönliche Einteilung eines Mitarbeiters für `days` Tage ab `from` */
export async function getMyAssignments(employeeId: string, from: string, days = 7): Promise<MyDay[]> {
  const to = addDays(from, days - 1);
  const [crew, absences] = await Promise.all([
    db.crewMember.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      select: {
        date: true,
        vehicleDay: {
          select: {
            vehicle: {
              select: { licensePlate: true, name: true, type: true, defaultDriverId: true, defaultDriver: { select: { firstName: true, lastName: true } } },
            },
            crew: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              select: { employee: { select: { id: true, firstName: true, lastName: true, shortName: true, qualification: true, phone: true } } },
            },
            assignments: {
              orderBy: { startMin: "asc" },
              select: {
                startMin: true,
                endMin: true,
                note: true,
                site: { select: { id: true, name: true, address: true, customer: true, orderNumber: true, note: true, color: true } },
              },
            },
          },
        },
      },
    }),
    db.absence.findMany({
      where: { startDate: { lte: to }, endDate: { gte: from } },
      select: { employeeId: true, startDate: true, endDate: true, note: true, withVehicle: true, type: { select: { name: true, code: true, color: true } } },
    }),
  ]);

  const own = absences.filter((a) => a.employeeId === employeeId);
  const absentOn = (id: string, d: string) => absences.some((a) => a.employeeId === id && a.startDate <= d && a.endDate >= d);

  return eachDay(from, to)
    .map((date): MyDay => {
      const entry = crew.find((c) => c.date === date);
      const abs = own.find((a) => a.startDate <= date && a.endDate >= date) ?? null;
      const vd = entry?.vehicleDay;
      const driverId = vd?.vehicle.defaultDriverId ?? null;
      return {
        date,
        absence: abs ? { type: abs.type, startDate: abs.startDate, endDate: abs.endDate, note: abs.note, withVehicle: abs.withVehicle } : null,
        vehicle: vd
          ? {
              licensePlate: vd.vehicle.licensePlate,
              name: vd.vehicle.name,
              type: vd.vehicle.type,
              isDefaultDriver: driverId === employeeId,
              owner: vd.vehicle.defaultDriver && driverId !== employeeId ? `${vd.vehicle.defaultDriver.firstName} ${vd.vehicle.defaultDriver.lastName}` : null,
            }
          : null,
        colleagues: (vd?.crew ?? [])
          .map((c) => c.employee)
          .filter((e) => e.id !== employeeId)
          .map((e) => ({ ...e, isDriver: e.id === driverId, absent: absentOn(e.id, date) })),
        sites: (vd?.assignments ?? []).map((a) => ({ ...a.site, startMin: a.startMin, endMin: a.endMin, assignmentNote: a.note })),
      };
    })
    // Wochenende nur zeigen, wenn dort etwas ansteht
    .filter((d, i) => i === 0 || !isWeekend(d.date) || d.vehicle || d.absence);
}
