import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { can, type Permission } from "@/lib/roles";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Stammdaten" };

const SECTIONS: { href: string; title: string; text: string; permission: Permission }[] = [
  { href: "/stammdaten/mitarbeiter", title: "Mitarbeiter", text: "Monteure, Ausbildungsstand, Abteilung", permission: "masterdata.edit" },
  { href: "/stammdaten/fahrzeuge", title: "Fahrzeuge", text: "Kennzeichen, Sitzplätze, Standard-Besatzung", permission: "masterdata.edit" },
  { href: "/stammdaten/baustellen", title: "Baustellen", text: "Adresse, Kunde, Zeitraum, Status", permission: "masterdata.edit" },
  { href: "/stammdaten/abteilungen", title: "Abteilungen", text: "Name und Farbe", permission: "admin.masterdata" },
  { href: "/stammdaten/abwesenheitsarten", title: "Abwesenheitsarten", text: "Urlaub, Krank, Berufsschule …", permission: "admin.masterdata" },
  { href: "/stammdaten/benutzer", title: "Benutzer", text: "Logins, Rollen, Passwörter", permission: "admin.users" },
  { href: "/protokoll", title: "Änderungsprotokoll", text: "Wer hat wann was eingeteilt oder geändert", permission: "audit.view" },
];

export default async function MasterDataPage() {
  const { user } = await requirePagePermission("masterdata.edit");
  return (
    <>
      <PageHeader title="Stammdaten" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.filter((s) => can(user.role, s.permission)).map((s) => (
          <Link key={s.href} href={s.href} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-line hover:ring-2 hover:ring-brand-600">
            <h2 className="text-lg font-bold">{s.title}</h2>
            <p className="text-muted">{s.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
