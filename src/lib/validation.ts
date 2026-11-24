import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./constants";
import { ROLES } from "./roles";

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`)
  .max(PASSWORD_MAX_LENGTH, "Das Passwort ist zu lang.");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Der Benutzername muss mindestens 3 Zeichen lang sein.")
  .max(50, "Der Benutzername ist zu lang.")
  .regex(/^[a-z0-9._-]+$/, "Erlaubt sind Kleinbuchstaben, Ziffern sowie . _ -");

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Bitte Benutzernamen eingeben.").max(50),
  password: z.string().min(1, "Bitte Passwort eingeben.").max(PASSWORD_MAX_LENGTH),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Bitte aktuelles Passwort eingeben."),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "Das neue Passwort muss sich vom aktuellen unterscheiden.",
    path: ["newPassword"],
  });

export const roleSchema = z.enum(ROLES);

const initialsSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(4, "Das Kürzel darf höchstens 4 Zeichen haben.")
  .regex(/^[A-ZÄÖÜ0-9]*$/, "Das Kürzel darf nur Buchstaben und Ziffern enthalten.")
  .nullish()
  .transform((v) => (v ? v : null));

export const createUserSchema = z.object({
  username: usernameSchema,
  initials: initialsSchema,
  password: passwordSchema,
  role: roleSchema,
  employeeId: z.string().min(1).nullable().optional(),
  mustChangePassword: z.boolean().optional().default(false),
});

export const updateUserSchema = z.object({
  version: z.number().int().positive(),
  username: usernameSchema.optional(),
  initials: initialsSchema,
  role: roleSchema.optional(),
  employeeId: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const userPrefsSchema = z.object({
  hideWeekends: z.boolean().optional(),
  /** in der Planung ausgeblendete Abteilungen */
  hiddenDepartments: z.array(z.string().min(1).max(64)).max(100).optional(),
  planningView: z.enum(["cards", "timeline"]).optional(),
});

const gridMinute = (label: string) =>
  z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .refine((v) => v % 15 === 0, `${label} muss im 15-Minuten-Raster liegen.`);

export const settingsSchema = z
  .object({
    version: z.number().int().positive(),
    companyName: z.string().trim().min(1, "Bitte einen Firmennamen angeben.").max(80),
    defaultStartMin: gridMinute("Arbeitsbeginn"),
    defaultEndMin: gridMinute("Arbeitsende"),
  })
  .refine((d) => d.defaultEndMin > d.defaultStartMin, {
    message: "Das Arbeitsende muss nach dem Arbeitsbeginn liegen.",
    path: ["defaultEndMin"],
  });
