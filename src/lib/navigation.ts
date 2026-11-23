import type { Permission } from "./roles";

export type NavItem = { href: string; label: string; short: string; permission: Permission; icon: string; desktopOnly?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/meine-einteilung", label: "Meine Einteilung", short: "Meine", permission: "planning.view", icon: "👤" },
  { href: "/planung", label: "Planung", short: "Planung", permission: "planning.view", icon: "📅" },
  { href: "/abwesenheiten", label: "Abwesenheiten", short: "Abwesend", permission: "absences.view", icon: "🏖️" },
  { href: "/stammdaten", label: "Stammdaten", short: "Daten", permission: "masterdata.edit", icon: "🗂️" },
  { href: "/protokoll", label: "Protokoll", short: "Protokoll", permission: "audit.view", icon: "📜", desktopOnly: true },
  { href: "/einstellungen", label: "Einstellungen", short: "Admin", permission: "admin.settings", icon: "🛠️" },
];
