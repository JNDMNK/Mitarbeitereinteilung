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
  /** Zeitraum im Betrieb (z. B. Praktikum) */
  availableFrom: string | null;
  availableUntil: string | null;
};
export type PVehicle = {
  id: string;
  /** "VEHICLE" | "ROOM" */
  kind: string;
  licensePlate: string;
  name: string;
  type: string | null;
  seats: number;
  active: boolean;
  sortOrder: number;
  /** Besitzer / Standard-Fahrer laut Stammdaten */
  ownerId: string | null;
  /** Abteilung laut Stammdaten (leer = Abteilung des Besitzers) */
  departmentId: string | null;
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
  /** freier Eintrag aus der Planung */
  adHoc: boolean;
};
export type PDepartment = { id: string; name: string; color: string; sortOrder: number };
export type PAbsenceType = { id: string; name: string; code: string; color: string };
export type PAbsence = {
  id: string;
  employeeId: string;
  typeId: string;
  startDate: string;
  endDate: string;
  note: string | null;
  /** Besitzer ist mit seinem Fahrzeug abwesend */
  withVehicle: boolean;
};
export type PCrew = { id: string; employeeId: string; sortOrder: number; assignedById: string | null; createdAt: string };
export type PAssignment = {
  id: string;
  siteId: string;
  startMin: number;
  endMin: number;
  note: string | null;
  version: number;
  /** wer den Einsatz zuletzt geplant/geändert hat */
  updatedById: string | null;
  updatedAt: string;
};
/** Benutzer, die eingeteilt haben (für Kürzel-Anzeige) */
export type PPlanner = { id: string; initials: string; name: string };
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
  planners: PPlanner[];
  settings: { defaultStartMin: number; defaultEndMin: number };
};

/** Antwort aller Planungs-Änderungen */
export type PlanningResult = { ok: true; messages: string[]; warnings: string[] };
