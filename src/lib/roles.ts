// Rollen und Rechte – gemeinsam für Server (Prüfung) und Client (Anzeige).
// Maßgeblich ist immer die serverseitige Prüfung.

export const ROLES = ["ADMIN", "PLANNER", "EMPLOYEE", "DISPLAY"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PLANNER: "Einteiler",
  EMPLOYEE: "Mitarbeiter",
  DISPLAY: "Anzeige (Monitor)",
};

export const PERMISSIONS = {
  /** Einteilung, Fahrzeuge, Mitarbeiter, Baustellen, Abwesenheiten bearbeiten */
  "planning.edit": ["ADMIN", "PLANNER"],
  "masterdata.edit": ["ADMIN", "PLANNER"],
  "absences.edit": ["ADMIN", "PLANNER"],
  "audit.view": ["ADMIN", "PLANNER"],
  /** Abteilungen, Abwesenheitsarten */
  "admin.masterdata": ["ADMIN"],
  "admin.users": ["ADMIN"],
  "admin.settings": ["ADMIN"],
  "admin.backup": ["ADMIN"],
  /** lesen: alle eingeloggten Benutzer */
  "planning.view": ["ADMIN", "PLANNER", "EMPLOYEE"],
  "absences.view": ["ADMIN", "PLANNER", "EMPLOYEE"],
  /** Monitor-Ansicht (nur lesen, mehrere Tage, ohne Menü) */
  "display.view": ["ADMIN", "PLANNER", "DISPLAY"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Startseite nach dem Login */
export function homePathFor(role: Role): string {
  if (role === "DISPLAY") return "/anzeige";
  return role === "EMPLOYEE" ? "/meine-einteilung" : "/planung";
}
