import { QUALIFICATION_BADGES, QUALIFICATION_LABELS, isApprentice, type Qualification } from "@/lib/constants";

/** Badge für den Ausbildungsstand: Azubis gelb, Geselle grau, Meister dunkel */
export function QualificationBadge({ q }: { q: string }) {
  const key = q as Qualification;
  const cls = isApprentice(q) ? "bg-amber-200 text-amber-950" : q === "MEISTER" ? "bg-ink text-white" : "bg-slate-300 text-slate-900";
  return (
    <span title={QUALIFICATION_LABELS[key] ?? q} className={`inline-flex min-w-7 justify-center rounded px-1 text-xs font-bold leading-5 ${cls}`}>
      {QUALIFICATION_BADGES[key] ?? "?"}
    </span>
  );
}
