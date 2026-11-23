import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/roles";
import { getSession } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  if (session) redirect(homePathFor(session.user.role));
  const { next } = await searchParams;
  // Nur relative Pfade innerhalb der App zulassen (kein Open Redirect)
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg ring-1 ring-line">
        <h1 className="mb-1 text-2xl font-bold">Einteilung</h1>
        <p className="mb-6 text-muted">Bitte melden Sie sich an.</p>
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
