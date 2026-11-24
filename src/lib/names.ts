/**
 * Kompakte, eindeutige Anzeigenamen: "Müller M."
 * Bei Gleichheit werden so viele Buchstaben des Vornamens genommen, bis der Name eindeutig ist
 * ("Müller Ma." / "Müller Mo."), notfalls der ganze Vorname.
 */
export function compactNames(employees: { id: string; firstName: string; lastName: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  const byLast = new Map<string, typeof employees>();
  for (const e of employees) {
    const key = e.lastName.trim().toLowerCase();
    byLast.set(key, [...(byLast.get(key) ?? []), e]);
  }
  for (const group of byLast.values()) {
    for (const e of group) {
      const first = e.firstName.trim();
      const others = group.filter((o) => o.id !== e.id).map((o) => o.firstName.trim().toLowerCase());
      let n = 1;
      while (n < first.length && others.some((o) => o.startsWith(first.slice(0, n).toLowerCase()))) n++;
      const part = n >= first.length ? first : `${first.slice(0, n)}.`;
      out.set(e.id, `${e.lastName.trim()} ${part}`);
    }
  }
  return out;
}
