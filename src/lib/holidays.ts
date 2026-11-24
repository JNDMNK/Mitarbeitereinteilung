// Gesetzliche Feiertage in Bayern (inkl. Mariä Himmelfahrt, gilt z. B. in Würzburg).
// Augsburger Friedensfest bewusst nicht enthalten.
import { addDays, isWeekend, weekday } from "./dates";

function easterSunday(year: number): string {
  // Anonymer gregorianischer Algorithmus
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const cache = new Map<number, Map<string, string>>();

export function holidaysOfYear(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const e = easterSunday(year);
  const y = String(year);
  const list: [string, string][] = [
    [`${y}-01-01`, "Neujahr"],
    [`${y}-01-06`, "Heilige Drei Könige"],
    [addDays(e, -2), "Karfreitag"],
    [addDays(e, 1), "Ostermontag"],
    [`${y}-05-01`, "Tag der Arbeit"],
    [addDays(e, 39), "Christi Himmelfahrt"],
    [addDays(e, 50), "Pfingstmontag"],
    [addDays(e, 60), "Fronleichnam"],
    [`${y}-08-15`, "Mariä Himmelfahrt"],
    [`${y}-10-03`, "Tag der Deutschen Einheit"],
    [`${y}-11-01`, "Allerheiligen"],
    [`${y}-12-25`, "1. Weihnachtstag"],
    [`${y}-12-26`, "2. Weihnachtstag"],
  ];
  const map = new Map(list);
  cache.set(year, map);
  return map;
}

/** Name des Feiertags oder null */
export function holidayName(iso: string): string | null {
  return holidaysOfYear(Number(iso.slice(0, 4))).get(iso) ?? null;
}

/** Wochenende oder Feiertag */
export function isDayOff(iso: string): boolean {
  return isWeekend(iso) || holidayName(iso) !== null;
}

/** Arbeitstage Mo–Fr derselben Kalenderwoche (ohne Feiertage) */
export function workdaysOfWeek(iso: string): string[] {
  const monday = addDays(iso, -((weekday(iso) + 6) % 7));
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = addDays(monday, i);
    if (!holidayName(d)) out.push(d);
  }
  return out;
}

/** Ist `iso` der erste Arbeitstag seiner Woche (meist Montag)? */
export function isFirstWorkdayOfWeek(iso: string): boolean {
  return workdaysOfWeek(iso)[0] === iso;
}

/** Restliche Arbeitstage der Woche nach `iso` */
export function remainingWorkdaysOfWeek(iso: string): string[] {
  return workdaysOfWeek(iso).filter((d) => d > iso);
}
