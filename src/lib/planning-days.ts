import { addDays } from "./dates";
import { isDayOff } from "./holidays";

export const VISIBLE_DAYS = 3;

/** Erster sichtbarer Tag: bei ausgeblendetem Wochenende/Feiertag -> nächster Arbeitstag */
export function normalizeStart(start: string, hideWeekends: boolean): string {
  let d = start;
  while (hideWeekends && isDayOff(d)) d = addDays(d, 1);
  return d;
}

/** Die sichtbaren Tage ab `start` (Wochenende ggf. übersprungen) */
export function visibleDays(start: string, hideWeekends: boolean, count = VISIBLE_DAYS): string[] {
  const out: string[] = [];
  let d = normalizeStart(start, hideWeekends);
  while (out.length < count) {
    if (!hideWeekends || !isDayOff(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** Einen (sichtbaren) Tag vor oder zurück: Fr -> Mo bzw. Mo -> Fr bei ausgeblendetem Wochenende */
export function stepDay(start: string, dir: 1 | -1, hideWeekends: boolean): string {
  let d = addDays(start, dir);
  while (hideWeekends && isDayOff(d)) d = addDays(d, dir);
  return d;
}
