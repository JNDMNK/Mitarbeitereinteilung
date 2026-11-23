import type { Permission } from "./roles";

export type NavItem = { href: string; label: string; short: string; permission: Permission; icon: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/meine-einteilung", label: "Meine Einteilung", short: "Meine", permission: "planning.view", icon: "👤" },
  { href: "/planung", label: "Planung", short: "Planung", permission: "planning.view", icon: "📅" },
  { href: "/abwesenheiten", label: "Abwesenheiten", short: "Abwesend", permission: "absences.view", icon: "🏖️" },
  { href: "/stammdaten", label: "Stammdaten", short: "Daten", permission: "masterdata.edit", icon: "🗂️" },
];
