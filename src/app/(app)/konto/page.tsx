import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/change-password-form";
import { LogoutButton } from "@/components/logout-button";
import { InstallApp } from "@/components/install-app";
import { PageHeader } from "@/components/page-header";
import { ROLE_LABELS } from "@/lib/roles";
import { requirePageSession } from "@/server/page-auth";
import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Mein Konto" };

export default async function AccountPage() {
  const { user } = await requirePageSession();
  return (
    <>
      <PageHeader title="Mein Konto" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-line">
          <h2 className="mb-3 text-lg font-bold">Angemeldet als</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">Benutzer</dt>
            <dd className="font-semibold">{user.username}</dd>
            <dt className="text-muted">Rolle</dt>
            <dd className="font-semibold">{ROLE_LABELS[user.role]}</dd>
            {user.employee && (
              <>
                <dt className="text-muted">Mitarbeiter</dt>
                <dd className="font-semibold">
                  {user.employee.firstName} {user.employee.lastName} ({user.employee.shortName})
                </dd>
              </>
            )}
          </dl>
          <h2 className="mb-3 mt-6 text-lg font-bold">Ansicht</h2>
          <PreferencesForm hideWeekends={user.hideWeekends} />
          <h2 className="mb-3 mt-6 text-lg font-bold">App auf dem Handy</h2>
          <InstallApp />
          <div className="mt-6">
            <LogoutButton />
          </div>
        </section>
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-line">
          <h2 className="mb-3 text-lg font-bold">Passwort ändern</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  );
}
