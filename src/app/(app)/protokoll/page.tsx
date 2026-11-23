import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PageHeader } from "@/components/page-header";
import { addDays, berlinDayStart, formatDate, isIsoDate, todayIso } from "@/lib/dates";
import { userInitials } from "@/lib/initials";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Änderungsprotokoll" };

const PAGE_SIZE = 50;

const AREAS = {
  planung: { label: "Planung", entities: ["CrewMember", "SiteAssignment", "VehicleDay", "Day"] },
  abwesenheiten: { label: "Abwesenheiten", entities: ["Absence"] },
  stammdaten: { label: "Stammdaten", entities: ["Employee", "Vehicle", "Site", "Department", "AbsenceType"] },
  benutzer: { label: "Benutzer & Anmeldung", entities: ["User"], adminOnly: true },
  system: { label: "Einstellungen & Sicherung", entities: ["AppSettings", "Backup"], adminOnly: true },
} as const;
type AreaKey = keyof typeof AREAS;

const ACTION_ICON: Record<string, string> = {
  create: "➕",
  assign: "➕",
  update: "✏️",
  move: "↔️",
  copy: "⧉",
  delete: "🗑",
  remove: "↩",
  release: "🗑",
  login: "🔑",
  login_failed: "⛔",
  locked: "🔒",
};

type SP = { von?: string; bis?: string; tag?: string; benutzer?: string; bereich?: string; q?: string; seite?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await requirePagePermission("audit.view");
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const today = todayIso();
  const von = isIsoDate(sp.von) ? sp.von : addDays(today, -30);
  const bis = isIsoDate(sp.bis) ? sp.bis : today;
  const tag = isIsoDate(sp.tag) ? sp.tag : "";
  const bereich = (sp.bereich && sp.bereich in AREAS ? sp.bereich : "") as AreaKey | "";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const seite = Math.max(1, Number.parseInt(sp.seite ?? "1", 10) || 1);

  // Zeitraum: ganze Kalendertage in Europe/Berlin
  const from = berlinDayStart(von);
  const to = berlinDayStart(addDays(bis, 1));

  const hidden = isAdmin ? [] : Object.values(AREAS).filter((a) => "adminOnly" in a && a.adminOnly).flatMap((a) => [...a.entities]);
  const where: Prisma.AuditLogWhereInput = {
    createdAt: { gte: from, lt: to },
    ...(tag ? { date: tag } : {}),
    ...(sp.benutzer ? { userId: sp.benutzer } : {}),
    ...(q ? { summary: { contains: q } } : {}),
    AND: [
      ...(bereich ? [{ entityType: { in: [...AREAS[bereich].entities] } }] : []),
      ...(hidden.length ? [{ entityType: { notIn: hidden } }] : []),
    ],
  };

  const [total, entries, users] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (seite - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { username: true, initials: true, employee: { select: { firstName: true, lastName: true, shortName: true } } } } },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "PLANNER"] } },
      select: { id: true, username: true, initials: true, employee: { select: { firstName: true, lastName: true, shortName: true } } },
      orderBy: { username: "asc" },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const params = new URLSearchParams({ von, bis, ...(tag ? { tag } : {}), ...(sp.benutzer ? { benutzer: sp.benutzer } : {}), ...(bereich ? { bereich } : {}), ...(q ? { q } : {}), seite: String(p) });
    return `/protokoll?${params.toString()}`;
  };
  const fmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "medium" });

  return (
    <>
      <LiveRefresh scopes={["planning", "absences", "masterdata"]} />
      <PageHeader title="Änderungsprotokoll" description="Wer hat wann was eingeteilt, verschoben oder geändert" />

      <form method="get" className="no-print mb-4 grid grid-cols-2 items-end gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-line md:flex md:flex-wrap">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Von</span>
          <input type="date" name="von" defaultValue={von} className="min-h-11 w-full rounded-lg border border-line px-2" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Bis</span>
          <input type="date" name="bis" defaultValue={bis} className="min-h-11 w-full rounded-lg border border-line px-2" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Planungstag</span>
          <input type="date" name="tag" defaultValue={tag} className="min-h-11 w-full rounded-lg border border-line px-2" title="Nur Einträge, die diesen Einsatztag betreffen" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Bereich</span>
          <select name="bereich" defaultValue={bereich} className="min-h-11 w-full rounded-lg border border-line px-2">
            <option value="">alle</option>
            {(Object.entries(AREAS) as [AreaKey, (typeof AREAS)[AreaKey]][])
              .filter(([, a]) => isAdmin || !("adminOnly" in a && a.adminOnly))
              .map(([k, a]) => (
                <option key={k} value={k}>
                  {a.label}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Benutzer</span>
          <select name="benutzer" defaultValue={sp.benutzer ?? ""} className="min-h-11 w-full rounded-lg border border-line px-2">
            <option value="">alle</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userInitials(u)} – {u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block md:min-w-56 md:flex-1">
          <span className="mb-1 block text-sm font-semibold">Suche</span>
          <input type="search" name="q" defaultValue={q} placeholder="z. B. Name, Kennzeichen, Baustelle" className="min-h-11 w-full rounded-lg border border-line px-3" />
        </label>
        <button type="submit" className="col-span-2 min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700 md:col-span-1">
          Filtern
        </button>
      </form>

      <p className="mb-2 text-sm text-muted">
        {total} Einträge · {formatDate(von)} – {formatDate(bis)}
        {tag && ` · Planungstag ${formatDate(tag)}`}
      </p>

      <ol className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line">
        {entries.length === 0 && <li className="p-6 text-center text-muted">Keine Einträge für diese Auswahl.</li>}
        {entries.map((e) => {
          const verb = e.action.split(".").pop() ?? "";
          const who = e.user ? userInitials(e.user) : "System";
          const whoName = e.user ? (e.user.employee ? `${e.user.employee.firstName} ${e.user.employee.lastName}` : e.user.username) : "System";
          return (
            <li key={e.id} className="flex gap-3 px-3 py-2">
              <span className="w-6 shrink-0 text-center text-lg" aria-hidden>
                {ACTION_ICON[verb] ?? "•"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words">{e.summary}</p>
                <p className="text-xs text-muted">
                  {fmt.format(e.createdAt)} · <strong className="font-mono text-ink" title={whoName}>{who}</strong> {whoName !== who && `(${whoName})`}
                  {e.date && (
                    <>
                      {" · "}
                      <Link href={`/planung?datum=${e.date}`} className="text-brand-700 underline">
                        Tag {formatDate(e.date)}
                      </Link>
                    </>
                  )}
                </p>
                {isAdmin && e.details && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted">Details</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">{(() => {
                      try {
                        return JSON.stringify(JSON.parse(e.details), null, 2);
                      } catch {
                        return e.details;
                      }
                    })()}</pre>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Seiten">
          {seite > 1 && (
            <Link href={link(seite - 1)} className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 font-semibold">
              ← Neuere
            </Link>
          )}
          <span className="text-sm text-muted">
            Seite {seite} von {pages}
          </span>
          {seite < pages && (
            <Link href={link(seite + 1)} className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 font-semibold">
              Ältere →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
