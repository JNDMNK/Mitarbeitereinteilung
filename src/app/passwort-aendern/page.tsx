import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";
import { getSession } from "@/server/auth/session";
import { LogoutButton } from "@/components/logout-button";

export const metadata: Metadata = { title: "Passwort ändern" };

export default async function ForcePasswordChangePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.mustChangePassword) redirect("/konto");

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <meta name="csrf-token" content={session.csrfToken} />
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg ring-1 ring-line">
        <h1 className="mb-1 text-2xl font-bold">Neues Passwort festlegen</h1>
        <p className="mb-6 text-muted">
          Hallo {session.user.username}, bitte vergeben Sie vor der ersten Nutzung ein eigenes Passwort.
        </p>
        <ChangePasswordForm redirectAfter />
        <div className="mt-4 border-t border-line pt-4">
          <LogoutButton variant="ghost" />
        </div>
      </div>
    </main>
  );
}
