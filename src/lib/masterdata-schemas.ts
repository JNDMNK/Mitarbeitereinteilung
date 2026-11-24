import { z } from "zod";
import { QUALIFICATIONS, SITE_STATUSES } from "./constants";
import { passwordSchema, usernameSchema } from "./validation";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Bitte eine gültige Farbe wählen.").transform((c) => c.toLowerCase());
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .nullish()
    .transform((v) => (v ? v : null));
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.")
  .refine((v) => !Number.isNaN(Date.parse(v + "T00:00:00Z")), "Ungültiges Datum.");
const optionalDate = isoDate.nullish().or(z.literal("")).transform((v) => (v ? v : null));
const version = z.number().int().positive();
const id = z.string().min(1).max(64);

// --- Abteilungen ---------------------------------------------------------
export const departmentSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(60),
  color,
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export const departmentUpdateSchema = departmentSchema.partial().extend({ version, active: z.boolean().optional() });

// --- Abwesenheitsarten ---------------------------------------------------
export const absenceTypeSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(60),
  code: z.string().trim().toUpperCase().min(1, "Bitte ein Kürzel angeben.").max(4, "Das Kürzel darf höchstens 4 Zeichen haben."),
  color,
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export const absenceTypeUpdateSchema = absenceTypeSchema.partial().extend({ version, active: z.boolean().optional() });

// --- Mitarbeiter ---------------------------------------------------------
const employeeBase = z.object({
  firstName: z.string().trim().min(1, "Bitte den Vornamen angeben.").max(60),
  lastName: z.string().trim().min(1, "Bitte den Nachnamen angeben.").max(60),
  shortName: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Das Kürzel muss mindestens 2 Zeichen haben.")
    .max(6, "Das Kürzel darf höchstens 6 Zeichen haben.")
    .regex(/^[A-ZÄÖÜ0-9]+$/, "Das Kürzel darf nur Buchstaben und Ziffern enthalten."),
  qualification: z.enum(QUALIFICATIONS, { message: "Bitte den Ausbildungsstand wählen." }),
  departmentId: id,
  phone: optionalText(40),
  /** Zeitraum im Betrieb (z. B. Praktikum) */
  availableFrom: optionalDate,
  availableUntil: optionalDate,
});
const employeePeriodRefine = <T extends { availableFrom?: string | null; availableUntil?: string | null; qualification?: string }>(s: z.ZodType<T>) =>
  s
    .refine((v) => !v.availableFrom || !v.availableUntil || v.availableFrom <= v.availableUntil, {
      message: "„im Betrieb bis“ darf nicht vor „von“ liegen.",
      path: ["availableUntil"],
    })
    .refine((v) => v.qualification !== "PRAKTIKANT" || !!v.availableUntil, {
      message: "Bei Praktikanten bitte angeben, bis wann das Praktikum dauert.",
      path: ["availableUntil"],
    });
export const employeeCreateSchema = employeeBase.extend({
  /** optional direkt einen Login (Rolle Mitarbeiter) anlegen */
  login: z
    .object({ username: usernameSchema, password: passwordSchema })
    .nullish(),
});
export const employeeCreateSchemaChecked = employeePeriodRefine(employeeCreateSchema);
export const employeeUpdateSchema = employeePeriodRefine(employeeBase.partial().extend({ version, active: z.boolean().optional() }));

// --- Fahrzeuge -----------------------------------------------------------
const vehicleBase = z.object({
  licensePlate: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Bitte das Kennzeichen angeben.")
    .max(15)
    .regex(/^[A-ZÄÖÜ0-9 -]+$/, "Das Kennzeichen darf nur Buchstaben, Ziffern, Leerzeichen und - enthalten."),
  name: z.string().trim().min(1, "Bitte eine Bezeichnung angeben.").max(60),
  type: optionalText(40),
  seats: z.number({ message: "Bitte die Sitzplätze angeben." }).int().min(1, "Mindestens 1 Sitzplatz.").max(9, "Höchstens 9 Sitzplätze."),
  defaultDriverId: id.nullish().transform((v) => v ?? null),
  defaultMemberIds: z.array(id).max(8).default([]),
  /** leer = Abteilung des Besitzers */
  departmentId: id.nullish().transform((v) => v ?? null),
  note: optionalText(500),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
const vehicleRefine = <T extends { defaultDriverId?: string | null; defaultMemberIds?: string[] }>(s: z.ZodType<T>) =>
  s
    .refine((v) => !v.defaultDriverId || !(v.defaultMemberIds ?? []).includes(v.defaultDriverId), {
      message: "Der Fahrer kann nicht zusätzlich Mitfahrer sein.",
      path: ["defaultMemberIds"],
    })
    .refine((v) => new Set(v.defaultMemberIds ?? []).size === (v.defaultMemberIds ?? []).length, {
      message: "Ein Mitfahrer ist doppelt ausgewählt.",
      path: ["defaultMemberIds"],
    });
export const vehicleCreateSchema = vehicleRefine(vehicleBase);
export const vehicleUpdateSchema = vehicleRefine(vehicleBase.partial().extend({ version, active: z.boolean().optional() }));

// --- Baustellen ----------------------------------------------------------
const siteBase = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(100),
  address: optionalText(200),
  customer: optionalText(100),
  orderNumber: optionalText(50),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(SITE_STATUSES).default("PLANNED"),
  note: optionalText(1000),
  color,
  /** false = als feste Baustelle in die Stammdaten übernehmen */
  adHoc: z.boolean().optional(),
});
const siteRefine = <T extends { startDate?: string | null; endDate?: string | null }>(s: z.ZodType<T>) =>
  s.refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
    message: "Das Ende darf nicht vor dem Beginn liegen.",
    path: ["endDate"],
  });
export const siteCreateSchema = siteRefine(siteBase);
export const siteUpdateSchema = siteRefine(siteBase.partial().extend({ version, active: z.boolean().optional() }));

export const COLOR_PRESETS = [
  "#c8102e", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a", "#0d9488",
  "#0891b2", "#2563eb", "#4f46e5", "#7c3aed", "#c026d3", "#db2777", "#64748b",
];

// --- Abwesenheiten -------------------------------------------------------
const absenceBase = z.object({
  employeeId: id,
  typeId: id,
  startDate: isoDate,
  endDate: isoDate,
  note: optionalText(300),
  /** nur für Fahrzeug-Besitzer: Fahrzeug ist mit abwesend (nicht verfügbar) */
  withVehicle: z.boolean().optional(),
});
const absenceRefine = <T extends { startDate?: string; endDate?: string }>(s: z.ZodType<T>) =>
  s.refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
    message: "Das Ende darf nicht vor dem Beginn liegen.",
    path: ["endDate"],
  });
export const absenceCreateSchema = absenceRefine(absenceBase);
export const absenceUpdateSchema = absenceRefine(absenceBase.omit({ employeeId: true }).partial().extend({ version }));
export const absenceDeleteSchema = z.object({ version });
export const absenceQuerySchema = z.object({ from: isoDate, to: isoDate });

// --- Login eines Mitarbeiters nachträglich anlegen / freischalten ---------
export const employeeLoginSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), username: usernameSchema, password: passwordSchema }),
  z.object({
    action: z.literal("activate"),
    /** optional neues Start-Passwort (muss beim nächsten Login geändert werden) */
    password: passwordSchema.optional(),
  }),
]);
