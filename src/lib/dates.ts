// Kalendertage als "YYYY-MM-DD" (Europe/Berlin). Rechnen über UTC-Mittag -> keine Sommerzeit-Fehler.

export const TZ = "Europe/Berlin";

export function todayIso(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: TZ });
}

function toUtcNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = toUtcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sonntag … 6 = Samstag */
export function weekday(iso: string): number {
  return toUtcNoon(iso).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const w = weekday(iso);
  return w === 0 || w === 6;
}

/** "2026-11-23" -> "23.11.2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** "Mo, 23.11." */
export function formatDayShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${WEEKDAYS_SHORT[weekday(iso)]}, ${d}.${m}.`;
}

/** "Montag, 23.11.2026" */
export function formatDayLong(iso: string): string {
  return `${WEEKDAYS_LONG[weekday(iso)]}, ${formatDate(iso)}`;
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/** Link zu Google Maps (Navigation auf dem Handy) */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
