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

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: roleSchema,
  employeeId: z.string().min(1).nullable().optional(),
  mustChangePassword: z.boolean().optional().default(true),
});

export const updateUserSchema = z.object({
  version: z.number().int().positive(),
  username: usernameSchema.optional(),
  role: roleSchema.optional(),
  employeeId: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const userPrefsSchema = z.object({
  hideWeekends: z.boolean().optional(),
  planningView: z.enum(["cards", "timeline"]).optional(),
});
