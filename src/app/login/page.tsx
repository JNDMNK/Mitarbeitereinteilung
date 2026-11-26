import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/roles";
import { Brand } from "@/components/brand";
import { getSession } from "@/server/auth/session";
import { env } from "@/server/env";
import { getSettings, logoUrl } from "@/server/services/settings";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  if (session) redirect(homePathFor(session.user.role));
  const { next } = await searchParams;
  // Nur relative Pfade innerhalb der App zulassen (kein Open Redirect)
  const settings = await getSettings();
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg ring-1 ring-line">
        <div className="mb-6 border-b border-line pb-5">
          <Brand companyName={settings.companyName} logoUrl={logoUrl(settings.logoFile)} size="lg" />
        </div>
        <h1 className="mb-1 text-xl font-bold">Anmelden</h1>
        <p className="mb-5 text-muted">Mitarbeitereinteilung</p>
        <LoginForm next={safeNext} appOrigin={env().appOrigin} />
      </div>
    </main>
  );
}
