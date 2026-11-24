import { QUALIFICATION_BADGES, QUALIFICATION_LABELS, isApprentice, type Qualification } from "@/lib/constants";

/** Badge für den Ausbildungsstand: Azubis gelb, Geselle grau, Meister dunkel */
export function QualificationBadge({ q }: { q: string }) {
  const key = q as Qualification;
  const cls =
    q === "PRAKTIKANT"
      ? "bg-sky-200 text-sky-950"
      : isApprentice(q)
        ? "bg-amber-200 text-amber-950"
        : q === "MEISTER"
          ? "bg-ink text-white"
          : "bg-slate-300 text-slate-900";
  return (
    <span title={QUALIFICATION_LABELS[key] ?? q} className={`inline-flex min-w-5 justify-center rounded px-1 text-[11px] font-bold leading-4 ${cls}`}>
      {QUALIFICATION_BADGES[key] ?? "?"}
    </span>
  );
}
