export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/** Login-Sperre pro Benutzer */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Rate-Limit fehlgeschlagener Logins pro IP */
export const LOGIN_RATE_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };

/** Sitzungsdauer (rollierend: verlängert sich bei Aktivität) */
export const SESSION_TTL_DAYS = 30;

export const QUALIFICATIONS = ["AZUBI_1", "AZUBI_2", "AZUBI_3", "AZUBI_4", "GESELLE", "MEISTER"] as const;
export type Qualification = (typeof QUALIFICATIONS)[number];
export const QUALIFICATION_LABELS: Record<Qualification, string> = {
  AZUBI_1: "1. Lehrjahr",
  AZUBI_2: "2. Lehrjahr",
  AZUBI_3: "3. Lehrjahr",
  AZUBI_4: "4. Lehrjahr",
  GESELLE: "Geselle",
  MEISTER: "Meister",
};
export const QUALIFICATION_BADGES: Record<Qualification, string> = {
  AZUBI_1: "A1",
  AZUBI_2: "A2",
  AZUBI_3: "A3",
  AZUBI_4: "A4",
  GESELLE: "G",
  MEISTER: "M",
};
export function isApprentice(q: string): boolean {
  return q.startsWith("AZUBI_");
}

export const SITE_STATUSES = ["PLANNED", "ACTIVE", "DONE"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];
export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  PLANNED: "geplant",
  ACTIVE: "aktiv",
  DONE: "abgeschlossen",
};
