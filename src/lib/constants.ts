export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

/** Login-Sperre pro Benutzer */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Rate-Limit fehlgeschlagener Logins pro IP */
export const LOGIN_RATE_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };

/** Sitzungsdauer (rollierend: verlängert sich bei Aktivität) */
export const SESSION_TTL_DAYS = 30;

export const QUALIFICATIONS = ["PRAKTIKANT", "AZUBI_1", "AZUBI_2", "AZUBI_3", "AZUBI_4", "GESELLE", "MEISTER"] as const;
export type Qualification = (typeof QUALIFICATIONS)[number];
export const QUALIFICATION_LABELS: Record<Qualification, string> = {
  PRAKTIKANT: "Praktikant",
  AZUBI_1: "1. Lehrjahr",
  AZUBI_2: "2. Lehrjahr",
  AZUBI_3: "3. Lehrjahr",
  AZUBI_4: "4. Lehrjahr",
  GESELLE: "Geselle",
  MEISTER: "Meister",
};
export const QUALIFICATION_BADGES: Record<Qualification, string> = {
  PRAKTIKANT: "P",
  AZUBI_1: "A1",
  AZUBI_2: "A2",
  AZUBI_3: "A3",
  AZUBI_4: "A4",
  GESELLE: "G",
  MEISTER: "M",
};
/** Reihenfolge der Gruppen in Listen: Meister, Gesellen, Azubis nach Lehrjahr, Praktikanten */
export const QUALIFICATION_GROUP_ORDER: Qualification[] = ["MEISTER", "GESELLE", "AZUBI_1", "AZUBI_2", "AZUBI_3", "AZUBI_4", "PRAKTIKANT"];
export const QUALIFICATION_GROUP_LABELS: Record<Qualification, string> = {
  MEISTER: "Meister",
  GESELLE: "Gesellen",
  AZUBI_1: "Azubis 1. Lehrjahr",
  AZUBI_2: "Azubis 2. Lehrjahr",
  AZUBI_3: "Azubis 3. Lehrjahr",
  AZUBI_4: "Azubis 4. Lehrjahr",
  PRAKTIKANT: "Praktikanten",
};
export function qualificationRank(q: string): number {
  const i = QUALIFICATION_GROUP_ORDER.indexOf(q as Qualification);
  return i < 0 ? 99 : i;
}
/** Liste nach Qualifikation gruppieren (Reihenfolge innerhalb der Gruppe bleibt erhalten) */
export function groupByQualification<T>(items: T[], qOf: (item: T) => string): { q: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const q = qOf(it);
    map.set(q, [...(map.get(q) ?? []), it]);
  }
  return [...map.entries()]
    .sort((a, b) => qualificationRank(a[0]) - qualificationRank(b[0]))
    .map(([q, list]) => ({ q, label: QUALIFICATION_GROUP_LABELS[q as Qualification] ?? q, items: list }));
}

export function isApprentice(q: string): boolean {
  return q.startsWith("AZUBI_");
}

/** ohne Gesellen-/Meisterbrief (Azubis und Praktikanten) */
export function isUnqualified(q: string): boolean {
  return isApprentice(q) || q === "PRAKTIKANT";
}

/** Wochentage für die Arbeitstage-Auswahl (ISO: 1 = Montag … 7 = Sonntag) */
export const WEEKDAY_OPTIONS = [
  { n: 1, short: "Mo", long: "montags" },
  { n: 2, short: "Di", long: "dienstags" },
  { n: 3, short: "Mi", long: "mittwochs" },
  { n: 4, short: "Do", long: "donnerstags" },
  { n: 5, short: "Fr", long: "freitags" },
  { n: 6, short: "Sa", long: "samstags" },
  { n: 7, short: "So", long: "sonntags" },
] as const;

/** ISO-Wochentag eines "YYYY-MM-DD" (1 = Montag … 7 = Sonntag) */
export function isoWeekday(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Arbeitet der Mitarbeiter an diesem Wochentag? (leer = an allen Tagen) */
export function worksOn(e: { workDays?: string | null }, date: string): boolean {
  return !e.workDays || e.workDays.includes(String(isoWeekday(date)));
}

/** Kurztext der Arbeitstage, z. B. "Mo–Do" oder "Mo, Di, Do" */
export function workDaysText(workDays: string | null | undefined): string {
  if (!workDays) return "alle Tage";
  const nums = [...new Set(workDays.split("").map(Number))].filter((n) => n >= 1 && n <= 7).sort();
  const isRange = nums.length > 2 && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  const short = (n: number) => WEEKDAY_OPTIONS[n - 1].short;
  return isRange ? `${short(nums[0])}–${short(nums[nums.length - 1])}` : nums.map(short).join(", ");
}

/** Ist der Mitarbeiter an diesem Tag im Betrieb (Zeitraum, z. B. Praktikum)? */
export function isAvailableOn(e: { availableFrom?: string | null; availableUntil?: string | null }, date: string): boolean {
  return (!e.availableFrom || e.availableFrom <= date) && (!e.availableUntil || e.availableUntil >= date);
}

export const SITE_STATUSES = ["PLANNED", "ACTIVE", "DONE"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];
export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  PLANNED: "geplant",
  ACTIVE: "aktiv",
  DONE: "abgeschlossen",
};

/** Gründe für einen Fahrzeug-Ausfall */
export const OUTAGE_REASONS = ["WORKSHOP", "TUEV", "TIRES", "ACCIDENT", "OTHER"] as const;
export type OutageReason = (typeof OUTAGE_REASONS)[number];
export const OUTAGE_REASON_LABELS: Record<OutageReason, string> = {
  WORKSHOP: "Werkstatt",
  TUEV: "TÜV",
  TIRES: "Reifenwechsel",
  ACCIDENT: "Unfall",
  OTHER: "Sonstiges",
};
export const OUTAGE_ICON = "🔧";
export function outageLabel(reason: string): string {
  return OUTAGE_REASON_LABELS[reason as OutageReason] ?? reason;
}
/** Fälligkeit (TÜV/Service) in so vielen Tagen anzeigen */
export const DUE_WARN_DAYS = 30;
