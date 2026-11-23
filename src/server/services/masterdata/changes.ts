import "server-only";

/** Lesbare Änderungsliste für das Protokoll: "Name: alt → neu" */
export function describeChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  labels: Partial<Record<keyof T, string>>,
  format: (key: keyof T, value: unknown) => string = (_k, v) => (v === null || v === undefined || v === "" ? "–" : String(v)),
): string[] {
  const out: string[] = [];
  for (const key of Object.keys(labels) as (keyof T)[]) {
    if (!(key in after)) continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    if (key === "active") {
      out.push(b ? "aktiviert" : "deaktiviert");
      continue;
    }
    out.push(`${labels[key]}: ${format(key, a)} → ${format(key, b)}`);
  }
  return out;
}

export function summaryWith(base: string, changes: string[]): string {
  return changes.length ? `${base}: ${changes.join(", ")}` : base;
}
