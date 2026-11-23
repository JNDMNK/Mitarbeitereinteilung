import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.");
const id = z.string().min(1).max(64);
const minute = z
  .number()
  .int()
  .min(0)
  .max(24 * 60)
  .refine((v) => v % 15 === 0, "Zeiten müssen im 15-Minuten-Raster liegen.");

export const planningQuerySchema = z.object({ from: date, to: date });

export const crewAssignSchema = z.object({
  date,
  employeeId: id,
  vehicleId: id,
  /** Wo der Client den Mitarbeiter vermutet (null = Pool) -> Schutz vor stillem Überschreiben */
  expectedFromVehicleId: id.nullable(),
});

export const crewRemoveSchema = z.object({
  date,
  employeeId: id,
  expectedFromVehicleId: id,
});

const timeWindow = <T extends { startMin?: number; endMin?: number }>(s: z.ZodType<T>) =>
  s.refine((v) => v.startMin === undefined || v.endMin === undefined || v.endMin > v.startMin, {
    message: "Das Ende muss nach dem Beginn liegen.",
    path: ["endMin"],
  });

export const assignmentCreateSchema = timeWindow(
  z.object({
    date,
    vehicleId: id,
    siteId: id,
    startMin: minute,
    endMin: minute,
    note: z.string().trim().max(300).nullish(),
  }),
);

export const assignmentUpdateSchema = timeWindow(
  z.object({
    id,
    version: z.number().int().positive(),
    siteId: id.optional(),
    startMin: minute.optional(),
    endMin: minute.optional(),
    note: z.string().trim().max(300).nullish(),
  }),
);

export const assignmentDeleteSchema = z.object({ id, version: z.number().int().positive() });

export const vehicleReleaseSchema = z.object({ date, vehicleId: id, version: z.number().int().positive() });

export const crewTransferSchema = z.object({
  fromDate: date,
  toDate: date,
  employeeId: id,
  /** Fahrzeug am Quelltag (null = Pool) */
  fromVehicleId: id.nullable(),
  toVehicleId: id,
  /** Wo der Client den Mitarbeiter am Zieltag vermutet (null = Pool) */
  toExpectedVehicleId: id.nullable(),
  copy: z.boolean(),
});

export const vehicleTransferSchema = timeWindow(
  z.object({
    fromDate: date,
    toDate: date,
    vehicleId: id,
    /** Quell-Einsatz (null = Fahrzeug aus dem Pool) */
    assignmentId: id.nullable(),
    /** Version des Fahrzeug-Tags am Quelltag (null = kein Fahrzeug-Tag) */
    fromVersion: z.number().int().positive().nullable(),
    /** Ziel-Baustelle (null = Pool des Zieltags) */
    toSiteId: id.nullable(),
    startMin: minute.optional(),
    endMin: minute.optional(),
    copy: z.boolean(),
  }),
);

export const dayCopySchema = z.object({
  fromDate: date,
  toDate: date,
  /** fehlt der Modus und ist der Zieltag belegt -> Rückfrage (409 target_not_empty) */
  mode: z.enum(["merge", "replace"]).optional(),
});

export const PLANNING_ACTIONS = {
  "crew-assign": crewAssignSchema,
  "crew-remove": crewRemoveSchema,
  "assignment-create": assignmentCreateSchema,
  "assignment-update": assignmentUpdateSchema,
  "assignment-delete": assignmentDeleteSchema,
  "vehicle-release": vehicleReleaseSchema,
  "crew-transfer": crewTransferSchema,
  "vehicle-transfer": vehicleTransferSchema,
  "day-copy": dayCopySchema,
} as const;
export type PlanningAction = keyof typeof PLANNING_ACTIONS;
