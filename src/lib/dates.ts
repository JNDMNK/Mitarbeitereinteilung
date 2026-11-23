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

/** Anzahl Tage von a bis b (b - a) */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcNoon(b).getTime() - toUtcNoon(a).getTime()) / 86_400_000);
}

/** Alle Tage von..bis (inklusive) */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthStart(iso: string): string {
  return iso.slice(0, 8) + "01";
}

export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(last).padStart(2, "0")}`;
}

export function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
/** "November 2026" */
export function formatMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "01.12.–05.12.2026" bzw. "01.12.2026" */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDate(from);
  const [fy, fm, fd] = from.split("-");
  const [ty] = to.split("-");
  return fy === ty ? `${fd}.${fm}.–${formatDate(to)}` : `${formatDate(from)}–${formatDate(to)}`;
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[weekday(iso)];
}

/** Routenplanung/Navigation zur Adresse (öffnet auf dem Handy die Navi-App) */
export function navigationUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}
