import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/page-auth";
import { getSettings, logoUrl } from "@/server/services/settings";
import { backupLabel, listBackups } from "@/server/services/backup";
import { BackupPanel } from "./backup-panel";
import { LogoForm, SettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  await requirePagePermission("admin.settings");
  const [s, backups] = await Promise.all([getSettings(), listBackups()]);
  return (
    <>
      <PageHeader title="Einstellungen" description="Firma, Logo und Standard-Arbeitszeit" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-line">
          <h2 className="mb-4 text-lg font-bold">Allgemein</h2>
          <SettingsForm
            version={s.version}
            companyName={s.companyName}
            defaultStartMin={s.defaultStartMin}
            defaultEndMin={s.defaultEndMin}
          />
        </section>
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-line">
          <h2 className="mb-4 text-lg font-bold">Firmenlogo</h2>
          <LogoForm logoUrl={logoUrl(s.logoFile)} />
        </section>
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-line lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">Datensicherung</h2>
          <BackupPanel files={backups.map((b) => ({ ...b, label: backupLabel(b.name) }))} />
        </section>
      </div>
    </>
  );
}
