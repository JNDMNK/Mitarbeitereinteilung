// Uhrzeiten als Minuten seit Mitternacht im 15-Minuten-Raster.

export const SLOT_MINUTES = 15;
export const DAY_MINUTES = 24 * 60;

export function isOnGrid(min: number): boolean {
  return Number.isInteger(min) && min >= 0 && min <= DAY_MINUTES && min % SLOT_MINUTES === 0;
}

/** 420 -> "07:00" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "07:15" -> 435; null bei ungültiger Eingabe */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** Auf das nächste 15-Minuten-Raster runden */
export function snapToGrid(min: number): number {
  return Math.min(DAY_MINUTES, Math.max(0, Math.round(min / SLOT_MINUTES) * SLOT_MINUTES));
}

/** Alle Rasterzeiten von..bis (inklusive) für Auswahllisten */
export function gridOptions(from = 0, to = DAY_MINUTES): number[] {
  const out: number[] = [];
  for (let t = from; t <= to; t += SLOT_MINUTES) out.push(t);
  return out;
}

/** Überschneiden sich zwei halboffene Intervalle [aStart, aEnd) und [bStart, bEnd)? */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
