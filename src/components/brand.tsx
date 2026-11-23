/* eslint-disable @next/next/no-img-element -- Logo kommt aus /api/logo, keine Bildoptimierung nötig */

/** Firmenlogo (falls vorhanden) + Firmenname. Logo auf weißem Grund, damit es auf Rot lesbar bleibt. */
export function Brand({ companyName, logoUrl, size = "sm" }: { companyName: string; logoUrl: string | null; size?: "sm" | "lg" }) {
  if (size === "lg") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        {logoUrl && <img src={logoUrl} alt={`Logo ${companyName}`} className="max-h-24 max-w-full object-contain" />}
        <span className="text-2xl font-bold">{companyName}</span>
      </div>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      {logoUrl && (
        <span className="flex h-10 shrink-0 items-center rounded-md bg-white px-1.5 py-1">
          <img src={logoUrl} alt="" className="h-full max-w-28 object-contain" />
        </span>
      )}
      {/* Mit Logo auf dem Handy nur das Logo zeigen (Platz) */}
      <span className={`truncate text-lg font-bold ${logoUrl ? "hidden md:inline" : ""}`}>{companyName}</span>
    </span>
  );
}
