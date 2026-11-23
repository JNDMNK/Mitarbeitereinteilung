// Datenstruktur der Planungsansicht (Antwort von GET /api/planning)

export type PEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  shortName: string;
  qualification: string;
  departmentId: string;
  phone: string | null;
  active: boolean;
};
export type PVehicle = {
  id: string;
  licensePlate: string;
  name: string;
  type: string | null;
  seats: number;
  active: boolean;
  sortOrder: number;
  defaultIds: string[];
};
export type PSite = {
  id: string;
  name: string;
  address: string | null;
  customer: string | null;
  orderNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  note: string | null;
  color: string;
  active: boolean;
};
export type PDepartment = { id: string; name: string; color: string; sortOrder: number };
export type PAbsenceType = { id: string; name: string; code: string; color: string };
export type PAbsence = { id: string; employeeId: string; typeId: string; startDate: string; endDate: string; note: string | null };
export type PCrew = { id: string; employeeId: string; sortOrder: number };
export type PAssignment = { id: string; siteId: string; startMin: number; endMin: number; note: string | null; version: number };
export type PVehicleDay = {
  id: string;
  date: string;
  vehicleId: string;
  note: string | null;
  version: number;
  crew: PCrew[];
  assignments: PAssignment[];
};

export type PlanningData = {
  from: string;
  to: string;
  employees: PEmployee[];
  vehicles: PVehicle[];
  sites: PSite[];
  departments: PDepartment[];
  absenceTypes: PAbsenceType[];
  absences: PAbsence[];
  vehicleDays: PVehicleDay[];
  settings: { defaultStartMin: number; defaultEndMin: number };
};

/** Antwort aller Planungs-Änderungen */
export type PlanningResult = { ok: true; messages: string[]; warnings: string[] };
